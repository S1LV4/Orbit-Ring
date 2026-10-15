import fs from "fs";
import path from "path";
import { PluginLoader } from "./plugin-loader";
import { hostServices } from "./host-services";
import type { HostConfig, HostReply, HostRequest, HostSnapshot } from "./plugin-host-protocol";
import { MARKER_FD, SNAPSHOT_POLL_MS } from "./plugin-host-protocol";

const config: HostConfig = JSON.parse(process.argv[2] || "{}");

const mark = (line: string) => {
  try { fs.writeSync(MARKER_FD, line + "\n"); } catch {}
};

const loader = new PluginLoader({
  pluginsDir: config.pluginsDir,
  locale: config.locale,
  unresponsive: config.unresponsive,
  hostServices,
  onPluginCall: (id, method, start) => mark(start ? `S ${id} ${method}` : "E"),
});

const send = (msg: HostReply) => {
  if (process.connected) process.send!(msg);
};

function snapshot(): HostSnapshot {
  const plugins = loader.getPlugins();
  const dirs: Record<string, string> = {};
  for (const p of plugins) {
    const dir = loader.getPluginDir(p.id);
    if (dir) dirs[p.id] = dir;
  }
  return { plugins, states: loader.getPluginStates(), attention: loader.getAttention(), dirs };
}

let last = "";
function push(): void {
  const snap = snapshot();
  const json = JSON.stringify(snap);
  if (json === last) return;
  last = json;
  send({ type: "snapshot", snapshot: snap });
}

let scheduled = false;
function schedulePush(): void {
  if (scheduled) return;
  scheduled = true;
  setImmediate(() => { scheduled = false; push(); });
}

loader.onStateChanged(schedulePush);
loader.onActionsChanged(schedulePush);
loader.onAttentionChanged(schedulePush);

const handlers: Record<HostRequest["method"], (...args: any[]) => unknown> = {
  loadAll: () => loader.loadAll(),
  loadFolder: (dir: string) => loader.loadFolder(dir),
  unload: (id: string) => loader.unload(id),
  executePluginAction: (pluginId: string, actionId: string) => loader.executePluginAction(pluginId, actionId),
  setLocale: (locale: string) => loader.setLocale(locale),
  unloadAll: () => loader.unloadAll(),
};

process.on("message", async (msg: HostRequest) => {
  let reply: HostReply;
  try {
    const value = await handlers[msg.method](...msg.args);
    reply = { type: "reply", id: msg.id, ok: true, value };
  } catch (e) {
    reply = { type: "reply", id: msg.id, ok: false, error: String((e as Error)?.message ?? e) };
  }
  push();
  send(reply);
});

function culpritOf(err: unknown): string | null {
  const stack = String((err as Error)?.stack ?? "").toLowerCase().replace(/\//g, "\\");
  for (const p of loader.getPlugins()) {
    const dir = loader.getPluginDir(p.id);
    if (dir && stack.includes(path.resolve(dir).toLowerCase() + "\\")) return p.id;
  }
  return null;
}

function fault(err: unknown): void {
  const pluginId = culpritOf(err);
  console.error(`[orbit] Uncaught error in the plugin host${pluginId ? ` from "${pluginId}"` : ""}:`, err);
  const exit = () => process.exit(1);
  if (!pluginId || !process.connected) return exit();
  process.send!({ type: "fault", pluginId } satisfies HostReply, exit);
  setTimeout(exit, 1000).unref();
}

process.on("uncaughtException", fault);
process.on("disconnect", () => process.exit(0));

setInterval(push, SNAPSHOT_POLL_MS).unref();
send({ type: "ready" });
