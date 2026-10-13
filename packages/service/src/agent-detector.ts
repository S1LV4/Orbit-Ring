import { AGENT_CATALOG, type AgentDef, type AgentStatus, type AgentEnvironment } from "@m-ring/shared";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME = os.homedir();
const IS_WIN = process.platform === "win32";
const IS_LINUX = process.platform === "linux";

// Detect if we're running inside WSL
const IS_WSL = IS_LINUX && (() => {
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch { return false; }
})();

/** Windows store path prefixes (relative to home) */
const WIN_PREFIXES = ["AppData/Roaming", "AppData/Local"];
/** Linux store path prefixes (relative to home) */
const LINUX_PREFIXES = [".config", ".local/share", ".local"];

/**
 * Detects installed and running AI coding agents across Windows, Linux, and WSL.
 *
 * On Windows: scans native paths + all WSL distros
 * On Linux:   scans native paths + Windows mount (/mnt/c/Users/...)
 * On WSL:     scans both Linux paths and Windows paths via /mnt/c
 */
export class AgentDetector {
  private cache: AgentStatus[] = [];
  private lastScan = 0;
  private scanInterval = 10_000;
  private wslDistros: string[] | null = null;

  async getAgents(): Promise<AgentStatus[]> {
    const now = Date.now();
    if (now - this.lastScan > this.scanInterval) {
      this.cache = await this.scan();
      this.lastScan = now;
    }
    return this.cache;
  }

  private async scan(): Promise<AgentStatus[]> {
    // Gather process lists from all environments in parallel
    const [nativeProcs, wslProcs, winHomeFromLinux] = await Promise.all([
      this.getNativeProcesses(),
      IS_WIN ? this.getWslProcesses() : Promise.resolve(new Map<string, Set<string>>()),
      (IS_LINUX || IS_WSL) ? this.findWindowsHomeFromLinux() : Promise.resolve(null),
    ]);

    const results: AgentStatus[] = [];

    for (const agent of AGENT_CATALOG) {
      const envs: AgentEnvironment[] = [];
      let running = false;
      let installed = false;
      let lastActive: number | undefined;
      let wslDistro: string | undefined;

      // ── Check native environment ──
      const nativeHome = HOME;
      const nativeInstalled = this.checkInstalled(agent, nativeHome);
      if (nativeInstalled) {
        installed = true;
        envs.push(IS_WIN ? "windows" : IS_WSL ? "wsl" : "linux");
        const mtime = this.getLastModified(agent, nativeHome);
        if (mtime && (!lastActive || mtime > lastActive)) lastActive = mtime;
      }

      // Check native processes
      const nativeRunning = agent.processNames.some((p) =>
        nativeProcs.has(p.toLowerCase())
      );
      if (nativeRunning) running = true;

      // ── On Windows: also check WSL distros ──
      if (IS_WIN) {
        const distros = await this.getWslDistros();
        for (const distro of distros) {
          const wslHome = this.getWslHomePath(distro);
          if (!wslHome) continue;

          const wslInstalled = this.checkInstalled(agent, wslHome, true);
          if (wslInstalled) {
            installed = true;
            if (!envs.includes("wsl")) envs.push("wsl");
            wslDistro = distro;
            const mtime = this.getLastModified(agent, wslHome);
            if (mtime && (!lastActive || mtime > lastActive)) lastActive = mtime;
          }

          // Check WSL processes
          const distroProcs = wslProcs.get(distro);
          if (distroProcs) {
            const wslRunning = agent.processNames.some((p) =>
              distroProcs.has(p.toLowerCase())
            );
            if (wslRunning) running = true;
          }
        }
      }

      // ── On Linux/WSL: also check Windows paths via /mnt ──
      if ((IS_LINUX || IS_WSL) && winHomeFromLinux) {
        const winInstalled = this.checkInstalled(agent, winHomeFromLinux, false);
        if (winInstalled) {
          installed = true;
          if (!envs.includes("windows")) envs.push("windows");
          const mtime = this.getLastModified(agent, winHomeFromLinux);
          if (mtime && (!lastActive || mtime > lastActive)) lastActive = mtime;
        }
      }

      results.push({
        id: agent.id,
        name: agent.name,
        icon: agent.icon,
        category: agent.category,
        running,
        installed,
        environments: envs,
        wslDistro,
        lastActive,
      });
    }

    return results;
  }

  /** Check if agent store paths exist under a given home directory */
  private checkInstalled(agent: AgentDef, home: string, linuxOnly = false): boolean {
    for (const sp of agent.storePaths) {
      // Skip Windows-specific paths when checking Linux, and vice versa
      if (linuxOnly && WIN_PREFIXES.some((p) => sp.startsWith(p))) continue;
      if (!linuxOnly && IS_WIN && sp.startsWith(".") && !sp.startsWith(".config")) {
        // On Windows, dotfiles go under home dir — still valid
      }

      // Check env overrides first
      if (agent.envOverrides) {
        for (const env of agent.envOverrides) {
          const val = process.env[env];
          if (val && fs.existsSync(val)) return true;
        }
      }

      const full = path.join(home, sp);
      if (fs.existsSync(full)) return true;
    }
    return false;
  }

  /** Get most recent modification time across agent store paths */
  private getLastModified(agent: AgentDef, home: string): number | undefined {
    let latest: number | undefined;
    for (const sp of agent.storePaths) {
      if (agent.envOverrides) {
        for (const env of agent.envOverrides) {
          const val = process.env[env];
          if (val) {
            try {
              const mtime = fs.statSync(val).mtimeMs;
              if (!latest || mtime > latest) latest = mtime;
            } catch {}
          }
        }
      }
      try {
        const full = path.join(home, sp);
        const mtime = fs.statSync(full).mtimeMs;
        if (!latest || mtime > latest) latest = mtime;
      } catch {}
    }
    return latest;
  }

  // ═══════════════════════════════════════════
  // Process detection
  // ═══════════════════════════════════════════

  /** Get running process names on the native OS */
  private getNativeProcesses(): Promise<Set<string>> {
    return new Promise((resolve) => {
      const cmd = IS_WIN
        ? 'powershell -NoProfile -Command "Get-Process | Select-Object -ExpandProperty ProcessName"'
        : "ps -eo comm= 2>/dev/null";

      exec(cmd, { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) { resolve(new Set()); return; }
        resolve(this.parseProcessList(stdout));
      });
    });
  }

  /** Get running processes inside each WSL distro (Windows only) */
  private async getWslProcesses(): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    const distros = await this.getWslDistros();

    const promises = distros.map((distro) =>
      new Promise<void>((resolve) => {
        exec(
          `wsl -d ${distro} -- ps -eo comm= 2>/dev/null`,
          { timeout: 5000, windowsHide: true },
          (err, stdout) => {
            if (!err && stdout) {
              result.set(distro, this.parseProcessList(stdout));
            }
            resolve();
          }
        );
      })
    );

    await Promise.all(promises);
    return result;
  }

  private parseProcessList(stdout: string): Set<string> {
    return new Set(
      stdout
        .split("\n")
        .map((line) => {
          let name = line.trim().toLowerCase();
          // ps on linux can return full path — extract basename
          const slash = name.lastIndexOf("/");
          if (slash >= 0) name = name.substring(slash + 1);
          return name;
        })
        .filter(Boolean)
    );
  }

  // ═══════════════════════════════════════════
  // WSL integration (Windows side)
  // ═══════════════════════════════════════════

  /** List installed WSL distros */
  private getWslDistros(): Promise<string[]> {
    if (this.wslDistros !== null) return Promise.resolve(this.wslDistros);

    return new Promise((resolve) => {
      if (!IS_WIN) { this.wslDistros = []; resolve([]); return; }

      exec(
        "wsl --list --quiet",
        { timeout: 5000, windowsHide: true },
        (err, stdout) => {
          if (err) { this.wslDistros = []; resolve([]); return; }
          // wsl --list outputs UTF-16LE with null bytes
          const clean = stdout.replace(/\0/g, "");
          const distros = clean
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("Windows Subsystem"));
          this.wslDistros = distros;
          resolve(distros);
        }
      );
    });
  }

  /** Get the Windows-accessible path to a WSL distro's home dir */
  private getWslHomePath(distro: string): string | null {
    // \\wsl$\<distro>\home\<username> or \\wsl.localhost\<distro>\home\<username>
    const username = os.userInfo().username;
    const paths = [
      `\\\\wsl.localhost\\${distro}\\home\\${username}`,
      `\\\\wsl$\\${distro}\\home\\${username}`,
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    // Try /root as fallback
    const rootPaths = [
      `\\\\wsl.localhost\\${distro}\\root`,
      `\\\\wsl$\\${distro}\\root`,
    ];
    for (const p of rootPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // Windows mount detection (Linux/WSL side)
  // ═══════════════════════════════════════════

  /** From inside Linux/WSL, find the Windows user home via /mnt/c */
  private findWindowsHomeFromLinux(): Promise<string | null> {
    return new Promise((resolve) => {
      // Try common mount points
      const mounts = ["/mnt/c", "/mnt/d"];
      for (const mnt of mounts) {
        const usersDir = path.join(mnt, "Users");
        try {
          if (!fs.existsSync(usersDir)) continue;
          const entries = fs.readdirSync(usersDir);
          for (const entry of entries) {
            if (["Public", "Default", "Default User", "All Users"].includes(entry)) continue;
            const userHome = path.join(usersDir, entry);
            const stat = fs.statSync(userHome);
            if (stat.isDirectory()) {
              // Verify it looks like a real user home
              const hasAppData = fs.existsSync(path.join(userHome, "AppData"));
              if (hasAppData) {
                resolve(userHome);
                return;
              }
            }
          }
        } catch {}
      }
      resolve(null);
    });
  }
}
