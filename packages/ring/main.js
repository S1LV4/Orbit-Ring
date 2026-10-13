const { app, BrowserWindow, screen, ipcMain } = require("electron");
const { WebSocket } = require("ws");
const path = require("path");

// Needed for transparent windows on some Windows systems
let ring = null;
let ws = null;

function createRingWindow() {
  ring = new BrowserWindow({
    width: 320,
    height: 320,
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

  ring.loadFile(path.join(__dirname, "src", "ring.html"));

  ring.on("ready-to-show", () => {
    console.log("[ring] Window ready");
  });
}

function showRing(cursorX, cursorY) {
  if (!ring) return;

  const cursor = cursorX != null
    ? { x: cursorX, y: cursorY }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const size = 320;

  let x = Math.round(cursor.x - size / 2);
  let y = Math.round(cursor.y - size / 2);

  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - size));
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - size));

  ring.setPosition(x, y);
  ring.webContents.send("ring-show", { cx: cursor.x - x, cy: cursor.y - y });
  ring.show();
  ring.focus();
  ring.moveTop();
  console.log(`[ring] SHOW at ${x},${y} bounds=${JSON.stringify(ring.getBounds())}`);
}

function hideRing() {
  if (ring && ring.isVisible()) {
    ring.webContents.send("ring-hide");
    ring.hide();
    console.log("[ring] HIDDEN");
  }
}

function connectService() {
  try {
    ws = new WebSocket("ws://localhost:9119");
  } catch {
    setTimeout(connectService, 2000);
    return;
  }

  ws.on("open", () => {
    console.log("[ring] Connected to m-ring service");
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "button_event" || msg.button !== "side2") return;

      console.log(`[ring] side2 ${msg.action} x=${msg.x} y=${msg.y}`);

      if (msg.action === "press") {
        showRing(msg.x, msg.y);
      } else if (msg.action === "release") {
        // Hold mode: on release, tell renderer to execute hovered action
        if (ring && ring.isVisible()) {
          ring.webContents.send("ring-release");
        }
      }
    } catch (e) {
      console.error("[ring] message error:", e);
    }
  });

  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    ws = null;
    setTimeout(connectService, 2000);
  });

  ws.on("error", () => {
    try { ws.close(); } catch {}
  });
}

ipcMain.on("execute-action", (_event, action) => {
  hideRing();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "test_action", action }));
  }
});

ipcMain.on("close-ring", () => {
  hideRing();
});

ipcMain.on("hide-ring", () => {
  if (ring) ring.hide();
});

app.whenReady().then(() => {
  createRingWindow();
  connectService();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
