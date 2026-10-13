import { execFile } from "child_process";

type AppChangedCallback = (appName: string) => void;

const POLL_INTERVAL_MS = 1500;

export class AppProfileSwitcher {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: AppChangedCallback[] = [];
  private currentApp = "";

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
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");

    this.getForegroundWindow = user32.func("GetForegroundWindow", "intptr", []) as () => number;
    this.getWindowThreadProcessId = user32.func(
      "GetWindowThreadProcessId",
      "uint32",
      ["intptr", "uint32 *"]
    ) as (hwnd: number, pidBuf: Buffer) => number;
  }

  onAppChanged(callback: AppChangedCallback): void {
    this.callbacks.push(callback);
  }

  getActiveApp(): string {
    return this.currentApp;
  }

  start(): void {
    if (process.platform !== "win32") return;
    if (this.pollTimer) return;
    if (!this.getForegroundWindow || !this.getWindowThreadProcessId) return;

    console.log("[orbit] AppProfileSwitcher started (poll every " + POLL_INTERVAL_MS + "ms)");

    this.pollTimer = setInterval(() => {
      this.poll();
    }, POLL_INTERVAL_MS);

    this.poll();
  }

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
    }
  }

  private resolveProcessName(pid: number): void {
    execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        if (err) return;
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
