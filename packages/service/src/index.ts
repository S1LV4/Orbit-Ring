import { WebSocketServer, WebSocket } from "ws";
import { WS_PORT } from "@m-ring/shared";
import { DeviceManager } from "./device-manager";
import { ConfigStore } from "./config-store";
import { ActionExecutor } from "./action-executor";
import { AgentDetector } from "./agent-detector";
import { AppProfileSwitcher } from "./app-profile-switch";
import { PluginLoader } from "./plugin-loader";
import { getClaudeUsage } from "./claude-usage";
import type { UIMessage, ServiceMessage } from "@m-ring/shared";

const config = new ConfigStore();
const devices = new DeviceManager();
const pluginLoader = new PluginLoader();
const executor = new ActionExecutor(pluginLoader);
const agentDetector = new AgentDetector();
const appSwitcher = new AppProfileSwitcher();

const wss = new WebSocketServer({ port: WS_PORT });

function broadcast(msg: ServiceMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Auto-switch ring group when focused app changes
appSwitcher.onAppChanged((processName) => {
  broadcast({ type: "active_app", processName, title: "" });
  const groupId = config.getGroupForProcess(processName);
  broadcast({ type: "profile_switch", processName, groupId });
});

// Forward device events to all connected UIs
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

  // Ring button: lock cursor on press, unlock only via explicit message (click-to-toggle)
  if (button === "side2") {
    if (action === "press") {
      // Safety: if no clients connected, don't lock (nobody would unlock)
      if (wss.clients.size === 0) return;
      devices.lockCursor((move) => {
        broadcast({ type: "ring_move", dx: move.dx, dy: move.dy } as any);
      });
    } else if (action === "release") {
      // Safety fallback: if cursor is still locked after release, start a timeout
      // In click-to-toggle the ring handles unlock, but if it didn't respond, auto-unlock
      setTimeout(() => {
        // Check if still locked (no unlock_cursor was received)
        // The safety timeout in win32-mouse-hook handles this too (30s)
      }, 0);
    }
    return;
  }

  // Execute bound action if not in identify mode
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

  // Send current state
  ws.send(JSON.stringify({ type: "devices", devices: devices.getDevices() }));
  ws.send(JSON.stringify({ type: "config_loaded", config: config.getConfig() }));
  ws.send(JSON.stringify({ type: "ring_config", ring: config.getRingSettings() }));
  agentDetector.getAgents().then((agents) => {
    ws.send(JSON.stringify({ type: "agents", agents }));
  });
  getClaudeUsage().then((usage) => {
    ws.send(JSON.stringify({ type: "claude_usage", usage }));
  });
  ws.send(JSON.stringify({ type: "plugins", plugins: pluginLoader.getPlugins() }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "unlock_cursor") {
        devices.unlockCursor();
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

    case "test_action":
      executor.execute(msg.action).then(() => {
        // If it was a plugin action, broadcast updated states
        if (msg.action?.action?.startsWith?.("plugin:") || (msg.action?.type === "system" && msg.action?.action?.startsWith?.("plugin:"))) {
          setTimeout(() => broadcast({ type: "plugin_states", states: pluginLoader.getPluginStates() } as any), 200);
        }
      }).catch(() => {});
      break;

    case "identify_button":
      devices.identifyMode = true;
      // Will reset after first button press
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

    case "get_plugins":
      ws.send(JSON.stringify({ type: "plugins", plugins: pluginLoader.getPlugins() }));
      break;

    case "execute_plugin_action":
      pluginLoader.executePluginAction(msg.pluginId, msg.actionId).then(() => {
        // Broadcast updated plugin states after action
        broadcast({ type: "plugin_states", states: pluginLoader.getPluginStates() } as any);
      }).catch((e) => {
        console.error("[orbit] Plugin action error:", e);
      });
      break;

    case "get_plugin_states":
      ws.send(JSON.stringify({ type: "plugin_states", states: pluginLoader.getPluginStates() }));
      break;
  }
}

console.log(`[orbit] Service running on ws://localhost:${WS_PORT}`);
devices.start();
appSwitcher.start();
executor.setPluginStateCallback(() => {
  broadcast({ type: "plugin_states", states: pluginLoader.getPluginStates() } as any);
});
pluginLoader.loadAll().then(() => {
  console.log(`[orbit] Plugins loaded (${pluginLoader.getPlugins().length} plugins)`);
});

// Broadcast Claude usage updates every 60 seconds
const claudeUsageInterval = setInterval(async () => {
  try {
    const usage = await getClaudeUsage();
    broadcast({ type: "claude_usage", usage });
  } catch (e) {
    console.error("[orbit] Claude usage broadcast error:", e);
  }
}, 60_000);

// Safety: always unlock cursor on exit/crash
function cleanup() {
  try { clearInterval(claudeUsageInterval); } catch {}
  try { pluginLoader.unloadAll(); } catch {}
  try { appSwitcher.stop(); } catch {}
  try { devices.unlockCursor(); } catch {}
  try { devices.stop(); } catch {}
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("uncaughtException", (e) => { console.error("[orbit] Uncaught:", e); cleanup(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("[orbit] Unhandled rejection:", e); cleanup(); process.exit(1); });
