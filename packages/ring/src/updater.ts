export type UpdateStatus =
  | { state: "disabled" }
  | { state: "idle" }
  | { state: "checking" }
  | { state: "none" }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown> | unknown;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface UpdaterOptions {
  updater: UpdaterLike;
  enabled: boolean;
  onStatus(status: UpdateStatus): void;
  intervalMs?: number;
  timers?: Timers;
}

export interface UpdaterControl {
  check(): Promise<void>;
  install(): void;
  stop(): void;
  status(): UpdateStatus;
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function startUpdater(opts: UpdaterOptions): UpdaterControl {
  let status: UpdateStatus = { state: opts.enabled ? "idle" : "disabled" };
  const current = (): UpdateStatus => status;
  const set = (next: UpdateStatus) => {
    status = next;
    opts.onStatus(next);
  };
  set(status);

  if (!opts.enabled) {
    return { check: async () => {}, install: () => {}, stop: () => {}, status: () => status };
  }

  const { updater } = opts;
  const timers: Timers = opts.timers ?? { setInterval, clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>) };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on("checking-for-update", () => set({ state: "checking" }));
  updater.on("update-not-available", () => set({ state: "none" }));
  updater.on("update-available", (info: { version?: string }) => set({ state: "downloading", version: String(info?.version ?? ""), percent: 0 }));
  updater.on("download-progress", (p: { percent?: number }) => {
    const version = status.state === "downloading" ? status.version : "";
    set({ state: "downloading", version, percent: Math.round(Number(p?.percent) || 0) });
  });
  updater.on("update-downloaded", (info: { version?: string }) => set({ state: "ready", version: String(info?.version ?? "") }));
  updater.on("error", (e: unknown) => {
    if (status.state !== "ready") set({ state: "error", message: message(e) });
  });

  const check = async () => {
    if (status.state === "downloading" || status.state === "ready") return;
    try {
      await updater.checkForUpdates();
    } catch (e) {
      if (current().state !== "ready") set({ state: "error", message: message(e) });
    }
  };

  const timer = timers.setInterval(() => { void check(); }, opts.intervalMs ?? SIX_HOURS);
  void check();

  return {
    check,
    install: () => {
      if (status.state === "ready") updater.quitAndInstall(true, true);
    },
    stop: () => timers.clearInterval(timer),
    status: () => status,
  };
}

export interface UpdateMenuItem {
  key: "tray.checkUpdates" | "tray.checkingUpdates" | "tray.downloadingUpdate" | "tray.restartToUpdate";
  params?: Record<string, string | number>;
  enabled: boolean;
  action: "check" | "install" | null;
}

export function updateMenuItem(status: UpdateStatus): UpdateMenuItem | null {
  switch (status.state) {
    case "disabled":
      return null;
    case "checking":
      return { key: "tray.checkingUpdates", enabled: false, action: null };
    case "downloading":
      return { key: "tray.downloadingUpdate", params: { version: status.version, percent: status.percent }, enabled: false, action: null };
    case "ready":
      return { key: "tray.restartToUpdate", params: { version: status.version }, enabled: true, action: "install" };
    default:
      return { key: "tray.checkUpdates", enabled: true, action: "check" };
  }
}
