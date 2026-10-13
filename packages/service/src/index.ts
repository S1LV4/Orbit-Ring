import { WebSocketServer, WebSocket } from "ws";
import { WS_PORT } from "@m-ring/shared";
import { DeviceManager } from "./device-manager";
import { ConfigStore } from "./config-store";
import { ActionExecutor } from "./action-executor";
import type { UIMessage, ServiceMessage } from "@m-ring/shared";

const config = new ConfigStore();
const devices = new DeviceManager();
const executor = new ActionExecutor();

const wss = new WebSocketServer({ port: WS_PORT });

function broadcast(msg: ServiceMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

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

  // Don't execute default bindings for buttons handled by the ring
  if (button === "side2") return;

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
  console.log("[m-ring] UI connected");

  // Send current state
  ws.send(JSON.stringify({ type: "devices", devices: devices.getDevices() }));
  ws.send(JSON.stringify({ type: "config_loaded", config: config.getConfig() }));

  ws.on("message", (raw) => {
    try {
      const msg: UIMessage = JSON.parse(raw.toString());
      handleMessage(msg, ws);
    } catch (e) {
      console.error("[m-ring] Invalid message:", e);
    }
  });

  ws.on("close", () => {
    console.log("[m-ring] UI disconnected");
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

    case "test_action":
      executor.execute(msg.action);
      break;

    case "identify_button":
      devices.identifyMode = true;
      // Will reset after first button press
      break;
  }
}

console.log(`[m-ring] Service running on ws://localhost:${WS_PORT}`);
devices.start();
