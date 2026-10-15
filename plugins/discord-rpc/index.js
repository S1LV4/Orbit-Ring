const net = require("net");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const i18n = require("./i18n")(__dirname);
const t = i18n.t;

const PIPE_PREFIX = process.platform === "win32" ? "\\\\?\\pipe\\discord-ipc-" : "/tmp/discord-ipc-";

const CLIENT_ID = "1559496309306556597";
const SCOPES = ["rpc", "identify", "rpc.voice.read", "rpc.voice.write"];
const ATTENTION_ID = "discord-auth";

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

let deps = {};
let host = null;
let codeVerifier = null;
let socket = null;
let auth = "connecting";
let reconnectTimer = null;
let voiceState = { mute: false, deaf: false };
let recvBuf = Buffer.alloc(0);
let currentUser = null;
let stopped = false;
let attentionShown = false;

const tokenPath = () => deps.tokenPath || path.join(os.homedir(), ".orbit", "credentials.json");
const authorized = () => auth === "authorized";

function setAuth(next) {
  if (auth === next) return;
  auth = next;
  if (next === "denied" || next === "error" || next === "not_approved") showAttention();
  else if (next === "authorized") clearAttention();
  changed();
}

function changed() {
  if (host && typeof host.stateChanged === "function") {
    try { host.stateChanged(); } catch {}
  }
}

function showAttention() {
  if (attentionShown || !host || typeof host.attention !== "function") return;
  attentionShown = true;
  try { host.attention({ id: ATTENTION_ID, title: t("attention.title"), text: t("attention.text"), timeoutMs: 60_000 }); } catch {}
}

function clearAttention() {
  if (!attentionShown || !host) return;
  attentionShown = false;
  try {
    if (typeof host.clearAttention === "function") host.clearAttention(ATTENTION_ID);
    else if (typeof host.attention === "function") host.attention(null);
  } catch {}
}

function generatePKCE() {
  codeVerifier = crypto.randomBytes(32).toString("base64url");
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function encode(opcode, data) {
  const json = JSON.stringify(data);
  const len = Buffer.byteLength(json);
  const buf = Buffer.alloc(8 + len);
  buf.writeUInt32LE(opcode, 0);
  buf.writeUInt32LE(len, 4);
  buf.write(json, 8);
  return buf;
}

function decode(buf) {
  if (buf.length < 8) return null;
  const opcode = buf.readUInt32LE(0);
  const length = buf.readUInt32LE(4);
  if (buf.length < 8 + length) return null;
  const json = JSON.parse(buf.slice(8, 8 + length).toString("utf8"));
  return { opcode, data: json, totalLen: 8 + length };
}

function send(opcode, payload) {
  if (!socket || socket.destroyed) return;
  try { socket.write(encode(opcode, payload)); } catch (e) { console.error("[discord-rpc] send error:", e.message); }
}

function sendCommand(cmd, args, evt) {
  const payload = { cmd, args, nonce: crypto.randomUUID() };
  if (evt) payload.evt = evt;
  send(OP.FRAME, payload);
}

function requestAuthorization() {
  const challenge = generatePKCE();
  sendCommand("AUTHORIZE", { client_id: CLIENT_ID, scopes: SCOPES, code_challenge: challenge, code_challenge_method: "S256" });
  setAuth("waiting");
}

function postForm(url, params) {
  if (deps.postForm) return Promise.resolve(deps.postForm(url, params)).catch(() => ({}));
  return new Promise((resolve) => {
    const body = new URLSearchParams(params).toString();
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on("error", () => resolve({}));
    req.write(body);
    req.end();
  });
}

function writeToken(token) {
  const sealed = host && typeof host.protectSecret === "function" ? host.protectSecret(JSON.stringify(token)) : null;
  const file = tokenPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sealed ? { version: 2, protected: sealed } : token, null, 2), { mode: 0o600 });
  } catch (e) { console.error("[discord-rpc] Failed to save the token:", e.message); }
}

function saveToken(data) {
  writeToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 604800) * 1000,
  });
}

function readToken() {
  let data;
  try { data = JSON.parse(fs.readFileSync(tokenPath(), "utf8")); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  if (data.version !== 2) {
    if (host && typeof host.protectSecret === "function") writeToken(data);
    return data;
  }
  const clear = host && typeof host.unprotectSecret === "function" ? host.unprotectSecret(data.protected) : null;
  try { return clear ? JSON.parse(clear) : null; } catch { return null; }
}

function forgetToken() {
  try { fs.unlinkSync(tokenPath()); } catch {}
}

async function grant(params) {
  const j = await postForm("https://discord.com/api/v10/oauth2/token", { client_id: CLIENT_ID, ...params });
  if (j && typeof j.access_token === "string") { saveToken(j); return j.access_token; }
  console.error("[discord-rpc] Token request refused:", (j && (j.error_description || j.error)) || "no token");
  return null;
}

async function loadToken() {
  const data = readToken();
  if (data && typeof data.access_token === "string" && data.expires_at > Date.now()) return data.access_token;
  if (data && typeof data.refresh_token === "string") return grant({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  return null;
}

function tryConnect(pipeIndex = 0) {
  if (stopped) return;
  if (pipeIndex > 9) {
    console.log("[discord-rpc] Discord IPC not found on pipes 0-9");
    setAuth("not_running");
    scheduleReconnect();
    return;
  }
  const connect = deps.connect || ((p, cb) => net.createConnection(p, cb));
  const sock = connect(PIPE_PREFIX + pipeIndex, () => {
    if (stopped) { sock.destroy(); return; }
    console.log(`[discord-rpc] Connected on pipe ${pipeIndex}`);
    socket = sock;
    recvBuf = Buffer.alloc(0);
    send(OP.HANDSHAKE, { v: 1, client_id: CLIENT_ID });
  });
  sock.on("data", onData);
  sock.on("error", (err) => {
    if (err.code === "ENOENT" || err.code === "ECONNREFUSED") { sock.destroy(); tryConnect(pipeIndex + 1); return; }
    console.error(`[discord-rpc] Socket error: ${err.message}`);
    handleDisconnect();
  });
  sock.on("close", () => { if (socket === sock) handleDisconnect(); });
  sock.setTimeout(3000, () => {
    if (auth !== "waiting") { sock.destroy(); tryConnect(pipeIndex + 1); }
  });
}

function onData(chunk) {
  recvBuf = Buffer.concat([recvBuf, chunk]);
  for (;;) {
    const frame = decode(recvBuf);
    if (!frame) break;
    recvBuf = recvBuf.slice(frame.totalLen);
    handleFrame(frame).catch((e) => console.error("[discord-rpc] Frame error:", e && e.message));
  }
}

async function handleFrame({ opcode, data }) {
  if (opcode === OP.PING) { send(OP.PONG, data); return; }
  if (opcode === OP.CLOSE) { console.log("[discord-rpc] Discord sent CLOSE"); handleDisconnect(); return; }
  if (opcode !== OP.FRAME) return;

  if (data.evt === "READY") {
    currentUser = data.data && data.data.user;
    if (socket) socket.setTimeout(0);
    const token = await loadToken();
    if (token) { sendCommand("AUTHENTICATE", { access_token: token }); return; }
    console.log("[discord-rpc] Asking Discord for authorization");
    requestAuthorization();
    return;
  }

  if (data.cmd === "AUTHORIZE") {
    if (data.evt === "ERROR") {
      console.log("[discord-rpc] Authorization refused in Discord");
      setAuth("denied");
      return;
    }
    const code = data.data && data.data.code;
    if (typeof code === "number") {
      console.log("[discord-rpc] Discord refused voice control for this app");
      setAuth("not_approved");
      return;
    }
    if (typeof code === "string" && code) {
      const token = await grant({ grant_type: "authorization_code", code, code_verifier: codeVerifier });
      if (token) sendCommand("AUTHENTICATE", { access_token: token });
      else setAuth("error");
    }
    return;
  }

  if (data.cmd === "AUTHENTICATE") {
    if (data.evt === "ERROR" || !(data.data && data.data.user)) {
      console.log("[discord-rpc] Saved authorization refused by Discord; asking again");
      forgetToken();
      requestAuthorization();
      return;
    }
    currentUser = data.data.user;
    console.log("[discord-rpc] Authorized — voice control by RPC");
    setAuth("authorized");
    sendCommand("SUBSCRIBE", {}, "VOICE_SETTINGS_UPDATE");
    sendCommand("GET_VOICE_SETTINGS", {});
    return;
  }

  if (data.cmd === "GET_VOICE_SETTINGS" || data.evt === "VOICE_SETTINGS_UPDATE") {
    const vs = data.data;
    if (vs) {
      voiceState.mute = !!vs.mute;
      voiceState.deaf = !!vs.deaf;
      changed();
    }
    return;
  }

  if (data.evt === "ERROR") {
    const code = data.data && data.data.code;
    console.error(`[discord-rpc] Error (${code}): ${data.data && data.data.message}`);
    if (code === 4002 || code === 4006) {
      forgetToken();
      requestAuthorization();
    }
  }
}

function handleDisconnect() {
  if (socket) { socket.destroy(); socket = null; }
  if (stopped) return;
  setAuth("connecting");
  scheduleReconnect();
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; tryConnect(); }, 15000);
}

function actionState(id) {
  if (authorized()) {
    const on = id === "toggle_mute" ? voiceState.mute : voiceState.deaf;
    return { active: on, label: t(`voice.${id}.${on ? "on" : "off"}`) };
  }
  if (auth === "not_running") return { active: false, text: "–", label: t("auth.not_running") };
  if (auth === "connecting") return { active: false, label: t("auth.connecting") };
  if (auth === "waiting") return { active: false, status: "amber", label: t("auth.waiting") };
  return { active: false, status: "red", label: t(`auth.${auth}`) };
}

function status() {
  if (authorized()) return { tone: "ok", text: t("status.authorized", { user: (currentUser && currentUser.username) || "?" }) };
  if (auth === "connecting") return { tone: "neutral", text: t("status.connecting") };
  if (auth === "not_running") return { tone: "neutral", text: t("status.not_running") };
  if (auth === "waiting") return { tone: "warn", text: t("status.waiting") };
  return { tone: "error", text: t("status.notAuthorized"), action: { id: "authorize", label: t("status.authorize") } };
}

function askAgain() {
  if (socket && !socket.destroyed && auth !== "waiting" && !authorized()) requestAuthorization();
}

function reset() {
  socket = null;
  auth = "connecting";
  reconnectTimer = null;
  voiceState = { mute: false, deaf: false };
  recvBuf = Buffer.alloc(0);
  currentUser = null;
  attentionShown = false;
  codeVerifier = null;
}

module.exports = {
  onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    if (host && host.locale) i18n.setLocale(host.locale);
    console.log("[discord-rpc] Plugin loaded — connecting to Discord...");
    stopped = false;
    tryConnect();
  },

  onUnload() {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket) { try { send(OP.CLOSE, {}); } catch {} socket.destroy(); socket = null; }
    clearAttention();
    host = null;
    reset();
  },

  onLocaleChanged(locale) {
    i18n.setLocale(locale);
    changed();
  },

  async onAction(actionId) {
    if (actionId === "authorize") {
      askAgain();
      return { handled: true, auth };
    }
    if (actionId !== "toggle_mute" && actionId !== "toggle_deafen") return;
    if (authorized()) {
      if (actionId === "toggle_mute") {
        voiceState.mute = !voiceState.mute;
        sendCommand("SET_VOICE_SETTINGS", { mute: voiceState.mute });
      } else {
        voiceState.deaf = !voiceState.deaf;
        if (voiceState.deaf) voiceState.mute = true;
        sendCommand("SET_VOICE_SETTINGS", { deaf: voiceState.deaf });
      }
      changed();
      return { handled: true, via: "rpc" };
    }
    askAgain();
    return { handled: false, reason: "not_authorized", auth };
  },

  getStatus() {
    return status();
  },

  getState() {
    return { toggle_mute: actionState("toggle_mute"), toggle_deafen: actionState("toggle_deafen") };
  },

  __test: {
    configure(d) {
      deps = d || {};
      reset();
    },
    auth: () => auth,
  },
};
