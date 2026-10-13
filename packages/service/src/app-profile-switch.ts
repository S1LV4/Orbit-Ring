import { execFile } from "child_process";

/**
 * Detects the currently focused application window on Windows
 * and notifies listeners when the focused app changes.
 *
 * Uses koffi (Win32 FFI) for GetForegroundWindow / GetWindowThreadProcessId,
 * then falls back to a lightweight PowerShell call to resolve PID → process name.
 *
 * On non-Windows platforms this module is a silent no-op.
 */

type AppChangedCallback = (appName: string) => void;

const POLL_INTERVAL_MS = 1500;

export class AppProfileSwitcher {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: AppChangedCallback[] = [];
  private currentApp = "";

  // Win32 FFI handles — lazily loaded
  private getForegroundWindow: (() => number) | null = null;
  private getWindowThreadProcessId: ((hwnd: number, pidBuf: Buffer) => number) | null = null;

  constructor() {
    if (process.platform === "win32") {
      try {
        this.initWin32();
      } catch (e) {
        console.error("[orbit] AppProfileSwitcher: failed to init Win32 FFI:", e);
      }
    }
  }

  private initWin32() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");

    this.getForegroundWindow = user32.func("GetForegroundWindow", "intptr", []) as () => number;
    this.getWindowThreadProcessId = user32.func(
      "GetWindowThreadProcessId",
      "uint32",
      ["intptr", "uint32 *"]
    ) as (hwnd: number, pidBuf: Buffer) => number;
  }

  /** Register a callback fired when the focused app changes. */
  onAppChanged(callback: AppChangedCallback): void {
    this.callbacks.push(callback);
  }

  /** Return the last detected foreground process name (e.g. "Code.exe"). */
  getActiveApp(): string {
    return this.currentApp;
  }

  /** Begin polling for the foreground window. */
  start(): void {
    if (process.platform !== "win32") return;
    if (this.pollTimer) return;
    if (!this.getForegroundWindow || !this.getWindowThreadProcessId) return;

    console.log("[orbit] AppProfileSwitcher started (poll every " + POLL_INTERVAL_MS + "ms)");

    this.pollTimer = setInterval(() => {
      this.poll();
    }, POLL_INTERVAL_MS);

    // Run once immediately
    this.poll();
  }

  /** Stop polling. */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private poll(): void {
    try {
      const hwnd = this.getForegroundWindow!();
      if (!hwnd) return;

      const pidBuf = Buffer.alloc(4);
      this.getWindowThreadProcessId!(hwnd, pidBuf);
      const pid = pidBuf.readUInt32LE(0);
      if (!pid) return;

      this.resolveProcessName(pid);
    } catch (e) {
      // Silently ignore — polling will retry
    }
  }

  private resolveProcessName(pid: number): void {
    // Use wmic (fast, no PowerShell startup overhead)
    // wmic is available on all supported Windows versions
    execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        if (err) return;
        // Output format: "process.exe","1234","Console","1","12,345 K"
        const match = stdout.match(/^"([^"]+)"/m);
        if (!match) return;

        const processName = match[1];
        if (processName && processName !== this.currentApp) {
          this.currentApp = processName;
          for (const cb of this.callbacks) {
            try {
              cb(processName);
            } catch {}
          }
        }
      }
    );
  }
}
