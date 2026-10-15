import { fork, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AttentionItem, PluginAction, PluginInfo, PluginStates } from "@orbitring/shared";
import type { HostConfig, HostReply, HostRequest, HostSnapshot } from "./plugin-host-protocol";
import { MARKER_FD } from "./plugin-host-protocol";

export interface PluginHostClientOptions {
  hostEntry: string;
  pluginsDir?: string;
  locale?: string;
  env?: NodeJS.ProcessEnv;
  /** Longest a synchronous call into a plugin may block the host before the plugin is turned off */
  callLimitMs?: number;
  memoryMb?: number;
  restartDelayMs?: number;
  /** Restarts allowed within a minute before the host is given up */
  maxRestarts?: number;
  rpcTimeoutMs?: number;
}

const EMPTY: HostSnapshot = { plugins: [], states: {}, attention: [], dirs: {} };
const RESTART_WINDOW_MS = 60_000;
const SHUTDOWN_MS = 10_000;

type Listener<T> = ((arg: T) => void) | null;

export class PluginHostClient {
  private opts: Required<Omit<PluginHostClientOptions, "env" | "pluginsDir" | "locale">> & { env?: NodeJS.ProcessEnv };
  private pluginsDir: string;
  private locale: string;
  private child: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private snap: HostSnapshot = EMPTY;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; fallback: unknown; timer: ReturnType<typeof setTimeout> }>();
  private calls: { id: string; method: string }[] = [];
  private callTimer: ReturnType<typeof setTimeout> | null = null;
  private markerBuf = "";
  private unresponsive = new Set<string>();
  private wantLoaded = false;
  private stopping = false;
  private restarts: number[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private givenUp = false;
  private stateListener: Listener<string> = null;
  private actionsListener: Listener<string> = null;
  private attentionListener: Listener<AttentionItem[]> = null;

  constructor(opts: PluginHostClientOptions) {
    this.opts = {
      callLimitMs: 5_000, memoryMb: 512, restartDelayMs: 500, maxRestarts: 5, rpcTimeoutMs: 30_000,
      ...opts,
    } as PluginHostClient["opts"];
    this.pluginsDir = opts.pluginsDir ?? path.join(os.homedir(), ".orbit", "plugins");
    this.locale = opts.locale ?? "en-US";
  }

  onStateChanged(cb: (pluginId: string) => void): void { this.stateListener = cb; }
  onActionsChanged(cb: (pluginId: string) => void): void { this.actionsListener = cb; }
  onAttentionChanged(cb: (items: AttentionItem[]) => void): void { this.attentionListener = cb; }

  hostPid(): number | null { return this.child?.pid ?? null; }
  isGivenUp(): boolean { return this.givenUp; }

  getLocale(): string { return this.locale; }
  getPluginsDir(): string {
    try { fs.mkdirSync(this.pluginsDir, { recursive: true }); } catch {}
    return this.pluginsDir;
  }
  getPluginDir(pluginId: string): string | null { return this.snap.dirs[pluginId] ?? null; }
  getPlugins(): PluginInfo[] { return this.snap.plugins; }
  getPluginStates(): PluginStates { return this.snap.states; }
  getAttention(): AttentionItem[] { return this.snap.attention; }
  getPluginActions(): PluginAction[] { return this.snap.plugins.flatMap((p) => p.actions); }

  async loadAll(): Promise<void> {
    this.wantLoaded = true;
    await this.rpc("loadAll", [], undefined);
  }

  async loadFolder(dir: string): Promise<boolean> {
    return (await this.rpc("loadFolder", [dir], false)) === true;
  }

  async unload(pluginId: string): Promise<boolean> {
    this.unresponsive.delete(pluginId);
    return (await this.rpc("unload", [pluginId], false)) === true;
  }

  async executePluginAction(pluginId: string, actionId: string): Promise<unknown> {
    return this.rpc("executePluginAction", [pluginId, actionId], { handled: false, failed: true });
  }

  setLocale(locale: string): void {
    if (!locale || locale === this.locale) return;
    this.locale = locale;
    if (this.child) void this.rpc("setLocale", [locale], undefined);
  }

  async unloadAll(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    const child = this.child;
    if (!child) return;
    await this.rpc("unloadAll", [], undefined, SHUTDOWN_MS);
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.kill();
    await closed;
  }

  private start(): Promise<void> {
    const config: HostConfig = { pluginsDir: this.pluginsDir, locale: this.locale, unresponsive: [...this.unresponsive] };
    const child = fork(this.opts.hostEntry, [JSON.stringify(config)], {
      execPath: process.execPath,
      execArgv: [`--max-old-space-size=${this.opts.memoryMb}`],
      env: this.opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    console.log(`[orbit] Plugin host started (pid ${child.pid})`);
    this.calls = [];
    this.markerBuf = "";
    const forward = (log: (line: string) => void) => (d: Buffer) => {
      for (const line of String(d).split(/\r?\n/)) if (line) log(line);
    };
    child.stdout?.on("data", forward((l) => console.log(l)));
    child.stderr?.on("data", forward((l) => console.error(l)));
    (child.stdio[MARKER_FD] as NodeJS.ReadableStream | null)?.on("data", (d: Buffer) => this.onMarkers(String(d)));
    child.on("close", () => this.onClose(child));
    this.ready = new Promise<void>((resolve) => {
      child.on("message", (msg: HostReply) => {
        if (msg.type === "ready") resolve();
        else this.onMessage(msg);
      });
      child.once("close", () => resolve());
    });
    return this.ready;
  }

  private async ensure(): Promise<boolean> {
    if (this.givenUp) return false;
    if (!this.child) {
      if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
      await this.start();
    } else {
      await this.ready;
    }
    return this.child !== null;
  }

  private async rpc(method: HostRequest["method"], args: unknown[], fallback: unknown, timeoutMs = this.opts.rpcTimeoutMs): Promise<unknown> {
    if (!(await this.ensure())) return fallback;
    const child = this.child!;
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(fallback); }, timeoutMs);
      this.pending.set(id, { resolve, fallback, timer });
      try {
        child.send({ id, method, args } satisfies HostRequest);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(fallback);
      }
    });
  }

  private onMessage(msg: HostReply): void {
    if (msg.type === "snapshot") this.apply(msg.snapshot);
    else if (msg.type === "fault") this.unresponsive.add(msg.pluginId);
    else if (msg.type === "reply") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (!msg.ok) console.error(`[orbit] Plugin host call failed: ${msg.error}`);
      p.resolve(msg.ok ? msg.value : p.fallback);
    }
  }

  private apply(next: HostSnapshot): void {
    const prev = this.snap;
    this.snap = next;
    const changed = (k: keyof HostSnapshot) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]);
    const fire = (fn: () => void, what: string) => {
      try { fn(); } catch (e) { console.error(`[orbit] Plugin ${what} handler error:`, e); }
    };
    if (changed("plugins") || changed("dirs")) fire(() => this.actionsListener?.(""), "actionsChanged");
    if (changed("states")) fire(() => this.stateListener?.(""), "stateChanged");
    if (changed("attention")) fire(() => this.attentionListener?.(next.attention), "attention");
  }

  private onMarkers(chunk: string): void {
    this.markerBuf += chunk;
    let nl: number;
    while ((nl = this.markerBuf.indexOf("\n")) >= 0) {
      const line = this.markerBuf.slice(0, nl);
      this.markerBuf = this.markerBuf.slice(nl + 1);
      if (line.startsWith("S ")) {
        const [, id, method] = line.split(" ");
        this.calls.push({ id, method });
        if (this.calls.length === 1) this.callTimer = setTimeout(() => this.child?.kill(), this.opts.callLimitMs);
      } else if (line === "E") {
        this.calls.pop();
        if (this.calls.length === 0 && this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null; }
      }
    }
  }

  private onClose(child: ChildProcess): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null; }
    const culprit = this.calls[this.calls.length - 1];
    this.calls = [];
    if (culprit && !this.stopping) {
      this.unresponsive.add(culprit.id);
      console.error(`[orbit] Plugin "${culprit.id}" (${culprit.method}) stopped responding — turned off until it is reinstalled or OrbitRing restarts`);
    }
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve(p.fallback); this.pending.delete(id); }
    if (this.stopping) return;
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= this.opts.maxRestarts) {
      this.givenUp = true;
      console.error("[orbit] The plugin host keeps exiting — plugins are off until OrbitRing restarts");
      this.apply({
        ...EMPTY,
        dirs: this.snap.dirs,
        plugins: this.snap.plugins.map((p) => ({ ...p, actions: [], loaded: false, problem: { kind: "unresponsive" } })),
      });
      return;
    }
    this.restarts.push(now);
    const delay = Math.min(10_000, this.opts.restartDelayMs * 2 ** (this.restarts.length - 1));
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopping || this.child) return;
      void this.start().then(() => { if (this.wantLoaded) void this.rpc("loadAll", [], undefined); });
    }, delay);
  }
}
