import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } from "electron";

// Disable GPU acceleration — not needed for this app, reduces resource usage
app.disableHardwareAcceleration();
import { WebSocket } from "ws";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

let ring: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let ws: WebSocket | null = null;
let svcProcess: ChildProcess | null = null;
let ringSize = 640;
let lastRingConfig: any = null;

// Paths work both in dev (__dirname = packages/ring) and packaged (inside asar + extraResources)
const IS_PACKAGED = app.isPackaged;
const RESOURCES = IS_PACKAGED ? process.resourcesPath : path.join(__dirname, "..");
const ASSETS = IS_PACKAGED ? path.join(RESOURCES, "app.asar", "assets") : path.join(__dirname, "..", "assets");
const CONFIG_FILE = IS_PACKAGED
  ? path.join(RESOURCES, "ui", "index.html")
  : null; // In dev, load from Vite dev server
const CONFIG_URL = "http://localhost:5173";
const SERVICE_PATH = IS_PACKAGED
  ? path.join(RESOURCES, "service", "index.js")
  : path.join(__dirname, "..", "service", "dist", "index.js");

/** Release Win32 state that the service may have left behind on crash */
function releaseWin32State() {
  try {
    // Spawn a short-lived node process to release ClipCursor and BlockInput
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
      cleanupEnv.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules")
        + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
    }
    const cp = spawn(cleanupExe, ["-e", cleanupCode], {
      stdio: "ignore",
      windowsHide: true,
      env: cleanupEnv,
    });
    cp.on("exit", () => console.log("[orbitring] Win32 state cleanup done"));
  } catch (e) {
    console.error("[orbitring] Failed to run Win32 cleanup:", e);
  }
}

function startService() {
  console.log("[orbitring] Starting service:", SERVICE_PATH);
  // Spawn as a child process using Electron's Node runtime with ELECTRON_RUN_AS_NODE
  const nodeExe = IS_PACKAGED ? process.execPath : "node";
  const env = { ...process.env };
  if (IS_PACKAGED) {
    env.ELECTRON_RUN_AS_NODE = "1";
    // Native modules are in app.asar.unpacked/node_modules
    env.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules")
      + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
  }
  svcProcess = spawn(nodeExe, [SERVICE_PATH], {
    stdio: "inherit",
    windowsHide: true,
    env,
  });
  svcProcess.on("exit", (code) => {
    console.log(`[orbitring] Service exited: ${code}`);
    // Safety: release any Win32 state the service may have left behind (ClipCursor, BlockInput)
    releaseWin32State();
    if (code !== 0) setTimeout(startService, 2000);
  });
}

function createRingWindow() {
  ring = new BrowserWindow({
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
      preload: path.join(__dirname, "preload.js"),
    },
  });

  ring.loadFile(path.join(__dirname, "src", "ring.html"), { query: { v: Date.now().toString() } });

  ring.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  ring.on("ready-to-show", () => {
    console.log("[ring] Window ready");
  });

  // With focusable:false, blur events don't apply
}

function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  const appIcon = nativeImage.createFromPath(path.join(ASSETS, "app-icon.png"));

  configWindow = new BrowserWindow({
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
      height: 36,
    },
    backgroundColor: "#0A0A0B",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (CONFIG_FILE) {
    configWindow.loadFile(CONFIG_FILE);
  } else {
    configWindow.loadURL(CONFIG_URL);
  }

  // Debug: log any load errors
  configWindow.webContents.on("did-fail-load", (_e: any, code: number, desc: string) => {
    console.error("[orbitring] Config window failed to load:", code, desc);
  });
  configWindow.webContents.on("console-message", (_e: any, _level: number, msg: string) => {
    if (msg.includes("Error") || msg.includes("error") || msg.includes("Failed")) {
      console.error("[orbitring] Console:", msg);
    }
  });

  configWindow.once("ready-to-show", () => {
    configWindow?.maximize();
    configWindow?.show();
  });

  // Log ALL console messages from the renderer
  configWindow.webContents.on("console-message", (_e: any, level: number, msg: string, line: number, source: string) => {
    console.log(`[ui:${level}] ${msg} (${source}:${line})`);
  });

  configWindow.on("closed", () => {
    configWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, "tray-icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("OrbitRing");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Config",
      click: () => createConfigWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => createConfigWindow());
}

function showRing(cursorX?: number, cursorY?: number) {
  if (!ring) return;

  // Don't reposition if already visible — the ring stays locked in place
  if (ring.isVisible()) return;

  const cursor = cursorX != null
    ? { x: cursorX, y: cursorY! }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  const size = ringSize;
  let x = Math.round(cursor.x - size / 2);
  let y = Math.round(cursor.y - size / 2);

  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - size));
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - size));

  // Atomic bounds change
  ring.setBounds({ x, y, width: size, height: size });

  // Send config + show signal BEFORE making window visible
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
  // Tell service to unlock cursor
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "unlock_cursor" }));
  }
}

function connectService() {
  ws = new WebSocket("ws://localhost:9119");

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
        // Release is ignored — click-to-toggle model
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
        // Send plugin actions to ring so it can register icons in CAT
        const pluginActions = (msg.plugins || []).flatMap((p: any) =>
          (p.actions || []).map((a: any) => ({ id: `plugin:${p.id}:${a.id}`, name: a.name, icon: a.icon, iconActive: a.iconActive }))
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
    } catch (e) { console.error("[ring] message error:", e); }
  });

  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    setTimeout(connectService, 2000);
  });

  ws.on("error", () => {
    ws?.close();
  });
}

ipcMain.on("execute-action", (_event, action) => {
  console.log("[ring] execute-action received:", JSON.stringify(action).slice(0, 100));
  hideRing();
  // Small delay to let the ring window hide and previous window regain focus
  setTimeout(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "test_action", action }));
      console.log("[ring] Action sent to service");
    } else {
      console.log("[ring] WebSocket not open, action lost! readyState:", ws?.readyState);
    }
  }, 100);
});

ipcMain.on("close-ring", () => {
  hideRing();
});

ipcMain.on("hide-ring", () => {
  if (ring) ring.hide();
});

app.whenReady().then(() => {
  // In dev mode (start.js), the service is already running — don't start another
  if (IS_PACKAGED) {
    startService();
  }
  createRingWindow();
  createTray();
  // Open config window on first launch
  createConfigWindow();
  // Connect to service WebSocket (in dev, it's already running via start.js)
  setTimeout(connectService, IS_PACKAGED ? 1500 : 500);
});

app.on("window-all-closed", (e: Event) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  releaseWin32State();
  if (svcProcess) svcProcess.kill();
});
