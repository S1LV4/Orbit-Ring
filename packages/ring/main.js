"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_electron = require("electron");
var import_ws = require("ws");
var import_child_process = require("child_process");
var path = __toESM(require("path"));
import_electron.app.disableHardwareAcceleration();
let ring = null;
let configWindow = null;
let tray = null;
let ws = null;
let svcProcess = null;
let ringSize = 640;
let lastRingConfig = null;
const IS_PACKAGED = import_electron.app.isPackaged;
const RESOURCES = IS_PACKAGED ? process.resourcesPath : path.join(__dirname, "..");
const ASSETS = IS_PACKAGED ? path.join(RESOURCES, "app.asar", "assets") : path.join(__dirname, "..", "assets");
const CONFIG_FILE = IS_PACKAGED ? path.join(RESOURCES, "ui", "index.html") : null;
const CONFIG_URL = "http://localhost:5173";
const SERVICE_PATH = IS_PACKAGED ? path.join(RESOURCES, "service", "index.js") : path.join(__dirname, "..", "service", "dist", "index.js");
function releaseWin32State() {
  try {
    const cleanupCode = `
      try {
        const koffi = require('koffi');
        const u32 = koffi.load('user32.dll');
        u32.func('ClipCursor', 'int', ['void *'])(null);
        u32.func('BlockInput', 'int', ['int'])(0);
      } catch {}
      process.exit(0);
    `;
    const cleanupExe = IS_PACKAGED ? process.execPath : "node";
    const cleanupEnv = { ...process.env };
    if (IS_PACKAGED) {
      cleanupEnv.ELECTRON_RUN_AS_NODE = "1";
      cleanupEnv.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules") + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
    }
    const cp = (0, import_child_process.spawn)(cleanupExe, ["-e", cleanupCode], {
      stdio: "ignore",
      windowsHide: true,
      env: cleanupEnv
    });
    cp.on("exit", () => console.log("[orbitring] Win32 state cleanup done"));
  } catch (e) {
    console.error("[orbitring] Failed to run Win32 cleanup:", e);
  }
}
function startService() {
  console.log("[orbitring] Starting service:", SERVICE_PATH);
  const nodeExe = IS_PACKAGED ? process.execPath : "node";
  const env = { ...process.env };
  if (IS_PACKAGED) {
    env.ELECTRON_RUN_AS_NODE = "1";
    env.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules") + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
  }
  svcProcess = (0, import_child_process.spawn)(nodeExe, [SERVICE_PATH], {
    stdio: "inherit",
    windowsHide: true,
    env
  });
  svcProcess.on("exit", (code) => {
    console.log(`[orbitring] Service exited: ${code}`);
    releaseWin32State();
    if (code !== 0) setTimeout(startService, 2e3);
  });
}
function createRingWindow() {
  ring = new import_electron.BrowserWindow({
    width: ringSize,
    height: ringSize,
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
      preload: path.join(__dirname, "preload.js")
    }
  });
  ring.loadFile(path.join(__dirname, "src", "ring.html"), { query: { v: Date.now().toString() } });
  ring.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ring.on("ready-to-show", () => {
    console.log("[ring] Window ready");
  });
}
function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  const appIcon = import_electron.nativeImage.createFromPath(path.join(ASSETS, "app-icon.png"));
  configWindow = new import_electron.BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    icon: appIcon,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0A0A0B",
      symbolColor: "#71717A",
      height: 36
    },
    backgroundColor: "#0A0A0B",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });
  if (CONFIG_FILE) {
    configWindow.loadFile(CONFIG_FILE);
  } else {
    configWindow.loadURL(CONFIG_URL);
  }
  configWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[orbitring] Config window failed to load:", code, desc);
  });
  configWindow.webContents.on("console-message", (_e, _level, msg) => {
    if (msg.includes("Error") || msg.includes("error") || msg.includes("Failed")) {
      console.error("[orbitring] Console:", msg);
    }
  });
  configWindow.once("ready-to-show", () => {
    configWindow?.maximize();
    configWindow?.show();
  });
  configWindow.webContents.on("console-message", (_e, level, msg, line, source) => {
    console.log(`[ui:${level}] ${msg} (${source}:${line})`);
  });
  configWindow.on("closed", () => {
    configWindow = null;
  });
}
function createTray() {
  const icon = import_electron.nativeImage.createFromPath(path.join(ASSETS, "tray-icon.png"));
  tray = new import_electron.Tray(icon);
  tray.setToolTip("OrbitRing");
  const contextMenu = import_electron.Menu.buildFromTemplate([
    {
      label: "Open Config",
      click: () => createConfigWindow()
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        import_electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => createConfigWindow());
}
function showRing(cursorX, cursorY) {
  if (!ring) return;
  if (ring.isVisible()) return;
  const cursor = cursorX != null ? { x: cursorX, y: cursorY } : import_electron.screen.getCursorScreenPoint();
  const display = import_electron.screen.getDisplayNearestPoint(cursor);
  const size = ringSize;
  let x = Math.round(cursor.x - size / 2);
  let y = Math.round(cursor.y - size / 2);
  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - size));
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - size));
  ring.setBounds({ x, y, width: size, height: size });
  if (lastRingConfig) ring.webContents.send("ring-config", lastRingConfig);
  ring.webContents.send("ring-show", { cx: cursor.x - x, cy: cursor.y - y });
  ring.showInactive();
  ring.moveTop();
}
function hideRing() {
  if (ring && ring.isVisible()) {
    ring.webContents.send("ring-hide");
    ring.hide();
  }
  if (ws?.readyState === import_ws.WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "unlock_cursor" }));
  }
}
function connectService() {
  ws = new import_ws.WebSocket("ws://localhost:9119");
  ws.on("open", () => {
    console.log("[ring] Connected to service");
  });
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "button_event" && msg.button === "side2") {
        console.log("[ring] side2", msg.action, "visible:", ring?.isVisible());
        if (msg.action === "press") {
          if (ring && ring.isVisible()) {
            console.log("[ring] Sending ring-release");
            ring.webContents.send("ring-release");
          } else {
            console.log("[ring] Showing ring at", msg.x, msg.y);
            showRing(msg.x, msg.y);
          }
        }
      } else if (msg.type === "ring_move") {
        if (ring && ring.isVisible()) {
          ring.webContents.send("ring-move", { dx: msg.dx, dy: msg.dy });
        }
      } else if (msg.type === "ring_config") {
        const r = msg.ring;
        lastRingConfig = r;
        ringSize = 640;
        if (ring) {
          ring.webContents.send("ring-config", r);
        }
      } else if (msg.type === "plugins") {
        const pluginActions = (msg.plugins || []).flatMap(
          (p) => (p.actions || []).map((a) => ({ id: `plugin:${p.id}:${a.id}`, name: a.name, icon: a.icon, iconActive: a.iconActive }))
        );
        if (ring && pluginActions.length) {
          ring.webContents.send("ring-config", { pluginActions });
        }
      } else if (msg.type === "plugin_states") {
        console.log("[ring] Got plugin states, forwarding to ring");
        if (ring) {
          ring.webContents.send("ring-config", { pluginStates: msg.states });
        }
      }
    } catch (e) {
      console.error("[ring] message error:", e);
    }
  });
  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    setTimeout(connectService, 2e3);
  });
  ws.on("error", () => {
    ws?.close();
  });
}
import_electron.ipcMain.on("execute-action", (_event, action) => {
  console.log("[ring] execute-action received:", JSON.stringify(action).slice(0, 100));
  hideRing();
  setTimeout(() => {
    if (ws?.readyState === import_ws.WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "test_action", action }));
      console.log("[ring] Action sent to service");
    } else {
      console.log("[ring] WebSocket not open, action lost! readyState:", ws?.readyState);
    }
  }, 100);
});
import_electron.ipcMain.on("close-ring", () => {
  hideRing();
});
import_electron.ipcMain.on("hide-ring", () => {
  if (ring) ring.hide();
});
import_electron.app.whenReady().then(() => {
  if (IS_PACKAGED) {
    startService();
  }
  createRingWindow();
  createTray();
  createConfigWindow();
  setTimeout(connectService, IS_PACKAGED ? 1500 : 500);
});
import_electron.app.on("window-all-closed", (e) => {
  e.preventDefault();
});
import_electron.app.on("before-quit", () => {
  releaseWin32State();
  if (svcProcess) svcProcess.kill();
});
