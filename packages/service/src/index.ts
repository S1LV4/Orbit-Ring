import { spawn } from "child_process";
import os from "os";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { WS_HOST, WS_PORT, serviceUrl } from "@orbitring/shared";
import { DeviceManager } from "./device-manager";
import { ConfigStore } from "./config-store";
import { ActionExecutor } from "./action-executor";
import { AgentDetector } from "./agent-detector";
import { AppProfileSwitcher } from "./app-profile-switch";
import { PluginHostClient } from "./plugin-host-client";
import { listCatalog, installFromCatalog, removeInstalled } from "./plugin-catalog";
import { getClaudeUsage } from "./claude-usage";
import { generateServiceToken, handleProtocols, makeVerifyClient, writeServiceToken } from "./service-auth";
import type { UIMessage, ServiceMessage } from "@orbitring/shared";
import { localeFor } from "@orbitring/shared/src/i18n";

const config = new ConfigStore();
const devices = new DeviceManager();
const appLocale = () => localeFor(config.getLocale(), [Intl.DateTimeFormat().resolvedOptions().locale]);
const pluginLoader = new PluginHostClient({ hostEntry: path.join(__dirname, "plugin-host.js"), locale: appLocale() });
const executor = new ActionExecutor(pluginLoader);
const agentDetector = new AgentDetector();
const appSwitcher = new AppProfileSwitcher();

const PORT = Number(process.env.ORBIT_WS_PORT) || WS_PORT;
const UI_PORT = Number(process.env.ORBIT_UI_PORT) || 9120;
const SERVICE_TOKEN = generateServiceToken();
const wss = new WebSocketServer({
  host: WS_HOST,
  port: PORT,
  verifyClient: makeVerifyClient(SERVICE_TOKEN, UI_PORT),
  handleProtocols,
});
wss.on("listening", () => {
  writeServiceToken(path.join(os.homedir(), ".orbit"), SERVICE_TOKEN);
  console.log(`[orbit] Service running on ${serviceUrl(PORT)}`);
});

function broadcast(msg: ServiceMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function pluginStatesMessage(): ServiceMessage {
  return { type: "plugin_states", states: pluginLoader.getPluginStates() };
}

let pluginStatesPending = false;
function broadcastPluginStates() {
  if (pluginStatesPending) return;
  pluginStatesPending = true;
  setImmediate(() => {
    pluginStatesPending = false;
    broadcast(pluginStatesMessage());
  });
}

function attentionMessage(): ServiceMessage {
  return { type: "attention", items: pluginLoader.getAttention() };
}

let attentionPending = false;
function broadcastAttention() {
  if (attentionPending) return;
  attentionPending = true;
  setImmediate(() => {
    attentionPending = false;
    broadcast(attentionMessage());
  });
}

let pluginsPending = false;
const PLUGIN_CATALOG_DIR = process.env.ORBIT_PLUGIN_CATALOG || undefined;
const pluginCatalog = () => listCatalog(PLUGIN_CATALOG_DIR, pluginLoader.getPluginsDir(), appLocale());
function broadcastPluginCatalog() {
  broadcast({ type: "plugin_catalog", plugins: pluginCatalog() });
}

async function installPlugin(pluginId: string) {
  await pluginLoader.unload(pluginId);
  const dir = installFromCatalog(PLUGIN_CATALOG_DIR, pluginId, pluginLoader.getPluginsDir());
  const ok = await pluginLoader.loadFolder(dir);
  broadcastPlugins();
  broadcastPluginCatalog();
  if (!ok) throw new Error("o plugin foi copiado, mas não carregou");
}

async function removePlugin(pluginId: string) {
  const dir = pluginLoader.getPluginDir(pluginId);
  if (!dir) throw new Error("plugin não está carregado");
  await pluginLoader.unload(pluginId);
  try {
    removeInstalled(dir, pluginLoader.getPluginsDir());
  } finally {
    broadcastPlugins();
    broadcastPluginCatalog();
  }
}

function broadcastPlugins() {
  if (pluginsPending) return;
  pluginsPending = true;
  setImmediate(() => {
    pluginsPending = false;
    broadcast({ type: "plugins", plugins: pluginLoader.getPlugins() });
    broadcastPluginStates();
  });
}

appSwitcher.onAppChanged((processName) => {
  broadcast({ type: "active_app", processName, title: "" });
  const groupId = config.getGroupForProcess(processName);
  broadcast({ type: "profile_switch", processName, groupId });
});

devices.on("button", (deviceId, button, action, x, y) => {
  broadcast({
    type: "button_event",
    deviceId,
    button,
    action,
    x,
    y,
    timestamp: Date.now(),
  });

  if (button === "side2") {
    if (action === "press") {
      if (wss.clients.size === 0) return;
      devices.lockCursor((move) => {
        broadcast({ type: "ring_move", dx: move.dx, dy: move.dy } as any);
      });
    } else if (action === "release") {
      setTimeout(() => {
      }, 0);
    }
    return;
  }

  if (!devices.identifyMode) {
    const binding = config.getBinding(button);
    if (binding) {
      executor.execute(binding.action);
    }
  }
});

devices.on("devices_changed", () => {
  broadcast({ type: "devices", devices: devices.getDevices() });
});

wss.on("connection", (ws) => {
  console.log("[orbit] UI connected");

  ws.send(JSON.stringify({ type: "devices", devices: devices.getDevices() }));
  ws.send(JSON.stringify({ type: "config_loaded", config: config.getConfig() }));
  ws.send(JSON.stringify({ type: "ring_config", ring: config.getRingSettings() }));
  ws.send(JSON.stringify({ type: "locale", locale: config.getLocale() }));
  agentDetector.getAgents().then((agents) => {
    ws.send(JSON.stringify({ type: "agents", agents }));
  });
  getClaudeUsage().then((usage) => {
    ws.send(JSON.stringify({ type: "claude_usage", usage }));
  });
  ws.send(JSON.stringify({ type: "plugins", plugins: pluginLoader.getPlugins() }));
  ws.send(JSON.stringify(pluginStatesMessage()));
  ws.send(JSON.stringify(attentionMessage()));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "unlock_cursor") {
        devices.unlockCursor();
        return;
      }
      if (msg.type === "move_cursor_lock") {
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) devices.moveCursorLock(msg.x, msg.y);
        return;
      }
      handleMessage(msg as UIMessage, ws);
    } catch (e) {
      console.error("[orbit] Invalid message:", e);
    }
  });

  ws.on("close", () => {
    console.log("[orbit] UI disconnected");
  });
});

function handleMessage(msg: UIMessage, ws: WebSocket) {
  switch (msg.type) {
    case "get_devices":
      ws.send(JSON.stringify({ type: "devices", devices: devices.getDevices() }));
      break;

    case "get_config":
      ws.send(JSON.stringify({ type: "config_loaded", config: config.getConfig() }));
      break;

    case "save_binding":
      config.saveBinding(msg.profileId, msg.binding);
      break;

    case "save_profile":
      config.saveProfile(msg.profile);
      break;

    case "delete_profile":
      config.deleteProfile(msg.profileId);
      break;

    case "save_ring":
      config.saveRingSettings(msg.ring);
      broadcast({ type: "ring_config", ring: msg.ring });
      break;

    case "set_locale":
      if (config.setLocale(msg.locale)) {
        broadcast({ type: "locale", locale: config.getLocale() });
        pluginLoader.setLocale(appLocale());
        broadcastPluginCatalog();
      } else ws.send(JSON.stringify({ type: "error", message: `Unknown language: ${String(msg.locale)}` }));
      break;

    case "test_action":
      executor.execute(msg.action).then(() => {
        const name: unknown = (msg.action as { action?: unknown } | undefined)?.action;
        if (typeof name === "string" && name.startsWith("plugin:")) {
          setTimeout(broadcastPluginStates, 200);
        }
      }).catch(() => {});
      break;

    case "identify_button":
      devices.identifyMode = true;
      break;

    case "get_agents":
      agentDetector.getAgents().then((agents) => {
        ws.send(JSON.stringify({ type: "agents", agents }));
      });
      break;

    case "get_claude_usage":
      getClaudeUsage().then((usage) => {
        ws.send(JSON.stringify({ type: "claude_usage", usage }));
      });
      break;

    case "get_app_ring_profiles":
      ws.send(JSON.stringify({ type: "app_ring_profiles", profiles: config.getAppRingProfiles() }));
      break;

    case "set_app_ring_profile":
      config.setAppRingProfile(msg.processName, msg.groupId);
      broadcast({ type: "app_ring_profiles", profiles: config.getAppRingProfiles() });
      break;

    case "remove_app_ring_profile":
      config.removeAppRingProfile(msg.processName);
      broadcast({ type: "app_ring_profiles", profiles: config.getAppRingProfiles() });
      break;

    case "open_plugins_folder": {
      const dir = pluginLoader.getPluginsDir();
      const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
      const child = spawn(cmd, [dir], { detached: true, stdio: "ignore" });
      child.on("error", (e) => {
        console.error("[orbit] Failed to open plugins folder:", e.message);
        ws.send(JSON.stringify({ type: "error", message: "Não foi possível abrir a pasta de plugins: " + dir }));
      });
      child.unref();
      break;
    }

    case "get_plugin_catalog":
      ws.send(JSON.stringify({ type: "plugin_catalog", plugins: pluginCatalog() }));
      break;

    case "install_plugin":
      installPlugin(String(msg.pluginId)).catch((e) => {
        console.error("[orbit] install_plugin failed:", e?.message || e);
        ws.send(JSON.stringify({ type: "error", message: "Não foi possível instalar o plugin: " + (e?.message || e) }));
      });
      break;

    case "remove_plugin":
      removePlugin(String(msg.pluginId)).catch((e) => {
        console.error("[orbit] remove_plugin failed:", e?.message || e);
        ws.send(JSON.stringify({ type: "error", message: "Não foi possível remover o plugin: " + (e?.message || e) }));
      });
      break;

    case "get_plugins":
      ws.send(JSON.stringify({ type: "plugins", plugins: pluginLoader.getPlugins() }));
      break;

    case "execute_plugin_action":
      pluginLoader.executePluginAction(msg.pluginId, msg.actionId).then(() => {
        broadcastPluginStates();
      }).catch((e) => {
        console.error("[orbit] Plugin action error:", e);
      });
      break;

    case "get_plugin_states":
      ws.send(JSON.stringify(pluginStatesMessage()));
      break;

    case "get_attention":
      ws.send(JSON.stringify(attentionMessage()));
      break;
  }
}

devices.start();
appSwitcher.start();
executor.setPluginStateCallback(broadcastPluginStates);
pluginLoader.onStateChanged(broadcastPluginStates);
pluginLoader.onActionsChanged(broadcastPlugins);
pluginLoader.onAttentionChanged(broadcastAttention);
pluginLoader.loadAll().then(() => {
  console.log(`[orbit] Plugins loaded (${pluginLoader.getPlugins().length} plugins)`);
  broadcast({ type: "plugins", plugins: pluginLoader.getPlugins() });
  broadcastPluginStates();
});

const claudeUsageInterval = setInterval(async () => {
  try {
    const usage = await getClaudeUsage();
    broadcast({ type: "claude_usage", usage });
  } catch (e) {
    console.error("[orbit] Claude usage broadcast error:", e);
  }
}, 60_000);

function cleanup() {
  try { clearInterval(claudeUsageInterval); } catch {}
  try { pluginLoader.unloadAll(); } catch {}
  try { appSwitcher.stop(); } catch {}
  try { devices.unlockCursor(); } catch {}
  try { devices.stop(); } catch {}
}
const PARENT_PID = Number(process.env.ORBIT_PARENT_PID) || 0;
if (PARENT_PID) {
  setInterval(() => {
    try {
      process.kill(PARENT_PID, 0);
    } catch {
      console.log(`[orbit] Parent process ${PARENT_PID} is gone, exiting`);
      process.exit(0);
    }
  }, 1000).unref();
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("uncaughtException", (e) => { console.error("[orbit] Uncaught:", e); cleanup(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("[orbit] Unhandled rejection:", e); cleanup(); process.exit(1); });
