import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, shell } from "electron";
import { createTranslator, resolveLocale, type MessageKey, type Params, type Translator } from "@orbitring/shared/src/i18n";
import { WebSocket } from "ws";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

app.disableHardwareAcceleration();

let translator: Translator | null = null;
function t(key: MessageKey, params?: Params): string {
  translator ??= createTranslator(resolveLocale(app.getPreferredSystemLanguages()));
  return translator(key, params);
}

let ring: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let ws: WebSocket | null = null;
let svcProcess: ChildProcess | null = null;
let ringSize = 640;
let lastRingConfig: any = null;
let lastPluginActions: any[] | null = null;
let lastPluginStates: Record<string, Record<string, unknown>> | null = null;

function sendRingState() {
  if (!ring || ring.isDestroyed()) return;
  const wc = ring.webContents;
  if (lastPluginActions) wc.send("ring-config", { pluginActions: lastPluginActions });
  if (lastRingConfig) wc.send("ring-config", ringConfigForRenderer());
  if (lastPluginStates) wc.send("ring-config", { pluginStates: lastPluginStates });
}

interface AttentionItem {
  id: string;
  title: string;
  text?: string;
  pluginId?: string;
  actionIds?: string[];
}

const ATTENTION_GROUP_ID = "__attention";
let attentionItems: AttentionItem[] = [];

function ringConfigForRenderer(): any {
  const cfg = lastRingConfig;
  if (!cfg || !Array.isArray(cfg.groups)) return cfg;
  const groups = cfg.groups.filter((g: any) => g?.id !== ATTENTION_GROUP_ID);
  const item = attentionItems.find((i) => i.pluginId && Array.isArray(i.actionIds) && i.actionIds.length > 0);
  if (!item) return groups.length === cfg.groups.length ? cfg : { ...cfg, groups };
  let actions = item.actionIds!.map((a) => `plugin:${item.pluginId}:${a}`);
  if (lastPluginActions) {
    const known = new Set(lastPluginActions.map((a: any) => a.id));
    actions = actions.filter((a) => known.has(a));
  }
  if (actions.length === 0) return cfg;
  const group = { id: ATTENTION_GROUP_ID, name: t("ring.attentionGroup"), icon: "brain", actions };
  return { ...cfg, groups: [group, ...groups] };
}

const CUE_W = 300;
const CUE_H = 84;
const CUE_FOLLOW_MS = 2000;
const CUE_FADE_MS = 180;

let cue: BrowserWindow | null = null;
let cueLoaded = false;
let cueShown = false;
let cueFollowTimer: ReturnType<typeof setInterval> | null = null;
let cueHideTimer: ReturnType<typeof setTimeout> | null = null;
let cueLastPos = { x: NaN, y: NaN };
let cueAnnounce = false;

function createCueWindow() {
  cue = new BrowserWindow({
    width: CUE_W,
    height: CUE_H,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  cueLoaded = false;
  cue.setIgnoreMouseEvents(true);
  cue.setAlwaysOnTop(true, "screen-saver");
  cue.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  cue.loadFile(path.join(__dirname, "src", "cue.html"));
  cue.webContents.on("did-finish-load", () => {
    cueLoaded = true;
    updateCue();
  });
  cue.on("closed", () => {
    cue = null;
    cueLoaded = false;
    cueShown = false;
    stopCueFollow();
  });
}

function positionCue() {
  if (!cue || cue.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const x = Math.round(wa.x + wa.width - CUE_W);
  const y = Math.round(wa.y + (wa.height - CUE_H) / 2);
  if (x === cueLastPos.x && y === cueLastPos.y) return;
  cueLastPos = { x, y };
  cue.setBounds({ x, y, width: CUE_W, height: CUE_H });
}

function stopCueFollow() {
  if (cueFollowTimer) { clearInterval(cueFollowTimer); cueFollowTimer = null; }
}

function cueScript(code: string) {
  if (!cue || cue.isDestroyed() || !cueLoaded) return;
  cue.webContents.executeJavaScript(code).catch(() => {});
}

function updateCue() {
  const item = attentionItems[0];
  const wanted = !!item && !(ring && !ring.isDestroyed() && ring.isVisible());

  if (!wanted) {
    stopCueFollow();
    if (!cue || cue.isDestroyed() || !cueShown) return;
    cueShown = false;
    cueScript("window.cueHide && window.cueHide()");
    if (cueHideTimer) clearTimeout(cueHideTimer);
    cueHideTimer = setTimeout(() => {
      cueHideTimer = null;
      if (cue && !cue.isDestroyed() && !cueShown) cue.hide();
    }, CUE_FADE_MS);
    return;
  }

  if (!cue || cue.isDestroyed()) { createCueWindow(); return; }
  if (!cueLoaded) return;
  if (cueHideTimer) { clearTimeout(cueHideTimer); cueHideTimer = null; }

  const data = {
    title: item.title || t("ring.attention"),
    text: item.text || "",
    count: attentionItems.length,
    accent: lastRingConfig?.accent,
    announce: cueAnnounce,
  };
  cueAnnounce = false;
  cueScript(`window.cueShow && window.cueShow(${JSON.stringify(data)})`);
  cueLastPos = { x: NaN, y: NaN };
  positionCue();
  if (!cueShown) {
    cueShown = true;
    cue.showInactive();
    cue.setAlwaysOnTop(true, "screen-saver");
  }
  if (!cueFollowTimer) cueFollowTimer = setInterval(positionCue, CUE_FOLLOW_MS);
}

function setAttention(items: unknown) {
  const next: AttentionItem[] = (Array.isArray(items) ? items : []).filter(
    (i: any) => i && typeof i.id === "string" && typeof i.title === "string"
  );
  const before = new Set(attentionItems.map((i) => `${i.pluginId}\n${i.id}`));
  const hasNew = next.some((i) => !before.has(`${i.pluginId}\n${i.id}`));
  attentionItems = next;
  if (hasNew) cueAnnounce = true;
  updateCue();
}

const IS_PACKAGED = app.isPackaged;
const RESOURCES = IS_PACKAGED ? process.resourcesPath : path.join(__dirname, "..");
const ASSETS = IS_PACKAGED ? path.join(RESOURCES, "app.asar", "assets") : path.join(__dirname, "..", "assets");
const CONFIG_FILE = IS_PACKAGED
  ? path.join(RESOURCES, "ui", "index.html")
  : null;
const CONFIG_URL = `http://localhost:${Number(process.env.ORBIT_UI_PORT) || 9120}`;
const SERVICE_PATH = IS_PACKAGED
  ? path.join(RESOURCES, "service", "index.js")
  : path.join(__dirname, "..", "service", "dist", "index.js");

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
  const nodeExe = IS_PACKAGED ? process.execPath : "node";
  const env = { ...process.env };
  if (IS_PACKAGED) {
    env.ELECTRON_RUN_AS_NODE = "1";
    env.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules")
      + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
    env.ORBIT_PLUGIN_CATALOG = path.join(RESOURCES, "plugins");
  }
  svcProcess = spawn(nodeExe, [SERVICE_PATH], {
    stdio: "inherit",
    windowsHide: true,
    env,
  });
  svcProcess.on("exit", (code) => {
    console.log(`[orbitring] Service exited: ${code}`);
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

  ring.webContents.on("did-finish-load", sendRingState);

  ring.on("show", updateCue);
  ring.on("hide", () => { setTimeout(updateCue, 450); });

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

  configWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  configWindow.webContents.on("did-fail-load", (_e: any, code: number, desc: string) => {
    console.error("[orbitring] Config window failed to load:", code, desc);
  });
  configWindow.webContents.on("console-message", (e) => {
    const msg = e.message;
    if (msg.includes("Error") || msg.includes("error") || msg.includes("Failed")) {
      console.error("[orbitring] Console:", msg);
    }
  });

  configWindow.once("ready-to-show", () => {
    configWindow?.maximize();
    configWindow?.show();
  });

  configWindow.webContents.on("console-message", (e) => {
    console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
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
      label: t("tray.openConfig"),
      click: () => createConfigWindow(),
    },
    { type: "separator" },
    {
      label: t("tray.quit"),
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => createConfigWindow());
}

const RING_CONTENT_RADIUS = 190;

function showRing(cursorX?: number, cursorY?: number) {
  if (!ring) return;

  if (ring.isVisible()) return;

  const cursor = cursorX != null
    ? { x: cursorX, y: cursorY! }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  const size = ringSize;
  const b = display.bounds;
  const reach = Math.min(RING_CONTENT_RADIUS, Math.floor(Math.min(b.width, b.height) / 2));
  const centerX = Math.round(Math.max(b.x + reach, Math.min(cursor.x, b.x + b.width - reach)));
  const centerY = Math.round(Math.max(b.y + reach, Math.min(cursor.y, b.y + b.height - reach)));
  const x = centerX - size / 2;
  const y = centerY - size / 2;

  ring.setBounds({ x, y, width: size, height: size });

  if ((centerX !== cursor.x || centerY !== cursor.y) && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move_cursor_lock", x: centerX, y: centerY }));
  }

  const inset = {
    l: Math.max(0, b.x - x), t: Math.max(0, b.y - y),
    r: Math.max(0, x + size - (b.x + b.width)), b: Math.max(0, y + size - (b.y + b.height)),
  };

  sendRingState();
  ring.webContents.send("ring-show", { cx: centerX - x, cy: centerY - y, inset });

  ring.showInactive();
  ring.moveTop();
}

function hideRing() {
  if (ring && ring.isVisible()) {
    ring.webContents.send("ring-hide");
    ring.hide();
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "unlock_cursor" }));
  }
}

function connectService() {
  ws = new WebSocket("ws://localhost:9119");

  ws.on("open", () => {
    console.log("[ring] Connected to service");
    ws?.send(JSON.stringify({ type: "get_plugins" }));
    ws?.send(JSON.stringify({ type: "get_plugin_states" }));
    ws?.send(JSON.stringify({ type: "get_attention" }));
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
          ring.webContents.send("ring-config", ringConfigForRenderer());
        }
      } else if (msg.type === "plugins") {
        const pluginActions = (msg.plugins || []).flatMap((p: any) =>
          (p.actions || []).map((a: any) => ({ id: `plugin:${p.id}:${a.id}`, name: a.name, icon: a.icon, iconActive: a.iconActive, keepIcon: a.keepIcon === true, image: typeof a.image === "string" ? a.image : undefined }))
        );
        lastPluginActions = pluginActions;
        if (ring && pluginActions.length) {
          ring.webContents.send("ring-config", { pluginActions });
          if (lastPluginStates) ring.webContents.send("ring-config", { pluginStates: lastPluginStates });
        }
      } else if (msg.type === "attention") {
        setAttention(msg.items);
      } else if (msg.type === "plugin_states") {
        lastPluginStates = msg.states || {};
        if (ring) {
          ring.webContents.send("ring-config", { pluginStates: lastPluginStates });
        }
      }
    } catch (e) { console.error("[ring] message error:", e); }
  });

  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    if (attentionItems.length) setAttention([]);
    setTimeout(connectService, 2000);
  });

  ws.on("error", () => {
    ws?.close();
  });
}

ipcMain.on("execute-action", (_event, action) => {
  console.log("[ring] execute-action received:", JSON.stringify(action).slice(0, 100));
  hideRing();
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

const IS_FIRST_INSTANCE = !IS_PACKAGED || app.requestSingleInstanceLock();
if (!IS_FIRST_INSTANCE) app.quit();
app.on("second-instance", () => createConfigWindow());

app.whenReady().then(() => {
  if (!IS_FIRST_INSTANCE) return;
  if (IS_PACKAGED) {
    startService();
  }
  createRingWindow();
  createTray();
  createConfigWindow();
  setTimeout(connectService, IS_PACKAGED ? 1500 : 500);
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  stopCueFollow();
  if (cue && !cue.isDestroyed()) cue.destroy();
  releaseWin32State();
  if (svcProcess) svcProcess.kill();
});
