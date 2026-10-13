import { app, BrowserWindow, screen, ipcMain } from "electron";
import { WebSocket } from "ws";
import * as path from "path";

let ring: BrowserWindow | null = null;
let ws: WebSocket | null = null;

function createRingWindow() {
  ring = new BrowserWindow({
    width: 360,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  ring.loadFile(path.join(__dirname, "..", "src", "ring.html"));

  // Hide when loses focus
  ring.on("blur", () => {
    hideRing();
  });

  ring.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function showRing() {
  if (!ring) return;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  // Center the ring on cursor, clamped to screen bounds
  const size = 360;
  let x = Math.round(cursor.x - size / 2);
  let y = Math.round(cursor.y - size / 2);

  // Clamp to display bounds
  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - size));
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - size));

  ring.setPosition(x, y);
  ring.show();
  ring.focus();
}

function hideRing() {
  if (ring && ring.isVisible()) {
    ring.hide();
  }
}

function connectService() {
  ws = new WebSocket("ws://localhost:9119");

  ws.on("open", () => {
    console.log("[ring] Connected to m-ring service");
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "button_event" && msg.button === "side2" && msg.action === "press") {
        if (ring?.isVisible()) {
          hideRing();
        } else {
          showRing();
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    setTimeout(connectService, 2000);
  });

  ws.on("error", () => {
    ws?.close();
  });
}

// Handle action execution from renderer
ipcMain.on("execute-action", (_event, action) => {
  hideRing();
  // Send action to the service for execution
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "test_action", action }));
  }
});

ipcMain.on("close-ring", () => {
  hideRing();
});

app.whenReady().then(() => {
  createRingWindow();
  connectService();
});

app.on("window-all-closed", (e: Event) => {
  e.preventDefault();
});
