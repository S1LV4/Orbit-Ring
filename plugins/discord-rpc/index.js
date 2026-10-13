const net = require("net");
const https = require("https");
const { exec } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PIPE_PREFIX = process.platform === "win32" ? "\\\\?\\pipe\\discord-ipc-" : "/tmp/discord-ipc-";

const CLIENT_ID = "1559496309306556597";
const SCOPES = ["rpc", "identify", "rpc.voice.read", "rpc.voice.write"];

const TOKEN_PATH = path.join(os.homedir(), ".orbit", "credentials.json");

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

let codeVerifier = null;
function generatePKCE() {
  codeVerifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return challenge;
}

let socket = null;
let authenticated = false;
let reconnectTimer = null;
let voiceState = { mute: false, deaf: false };
let recvBuf = Buffer.alloc(0);
let currentUser = null;
let waitingAuth = false;

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

function nonce() { return crypto.randomUUID(); }

function send(opcode, payload) {
  if (!socket || socket.destroyed) return;
  try { socket.write(encode(opcode, payload)); } catch (e) { console.error("[discord-rpc] send error:", e.message); }
}

function sendCommand(cmd, args, evt) {
  const n = nonce();
  const payload = { cmd, args, nonce: n };
  if (evt) payload.evt = evt;
  send(OP.FRAME, payload);
  return n;
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      if (data.access_token && data.expires_at > Date.now()) return data.access_token;
      if (data.refresh_token) return refreshToken(data.refresh_token);
    }
  } catch {}
  return null;
}

function saveToken(data) {
  try {
    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 604800) * 1000,
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
  } catch (e) { console.error("[discord-rpc] Failed to save token:", e.message); }
}

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const params = { client_id: CLIENT_ID, grant_type: "authorization_code", code, code_verifier: codeVerifier };
    const body = new URLSearchParams(params).toString();

    const req = https.request({
      hostname: "discord.com",
      path: "/api/v10/oauth2/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) { saveToken(j); resolve(j.access_token); }
          else { console.error("[discord-rpc] Token response:", JSON.stringify(j)); reject(new Error(j.error_description || j.error || "No token")); }
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function refreshToken(refresh) {
  return new Promise((resolve) => {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }).toString();

    const req = https.request({
      hostname: "discord.com",
      path: "/api/oauth2/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) { saveToken(j); resolve(j.access_token); }
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

function sendDiscordKeystroke(vk) {
  if (process.platform !== "win32") return;
  const vkHex = "0x" + vk.toString(16).toUpperCase();
  const ps = `
Add-Type -MemberDefinition @'
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);
'@ -Name W -Namespace K
$prev = [K.W]::GetForegroundWindow()
$disc = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
if ($disc) {
  [K.W]::SetForegroundWindow($disc.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 150
  [K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x10,0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(${vkHex},0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(${vkHex},0,2,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x10,0,2,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [K.W]::SetForegroundWindow($prev) | Out-Null
}`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000, windowsHide: true });
}

let stopped = false;

function tryConnect(pipeIndex = 0) {
  if (stopped) return;
  if (pipeIndex > 9) {
    console.log("[discord-rpc] Discord IPC not found on pipes 0-9");
    scheduleReconnect();
    return;
  }

  const pipePath = PIPE_PREFIX + pipeIndex;
  if (pipeIndex === 0) console.log("[discord-rpc] Connecting to Discord...");

  const sock = net.createConnection(pipePath, () => {
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
  sock.on("close", () => { if (socket === sock) { handleDisconnect(); } });
  sock.setTimeout(3000, () => {
    if (!waitingAuth) { sock.destroy(); tryConnect(pipeIndex + 1); }
  });
}

function onData(chunk) {
  recvBuf = Buffer.concat([recvBuf, chunk]);
  while (true) {
    const frame = decode(recvBuf);
    if (!frame) break;
    recvBuf = recvBuf.slice(frame.totalLen);
    handleFrame(frame);
  }
}

async function handleFrame(frame) {
  const { opcode, data } = frame;
  if (opcode === OP.PING) { send(OP.PONG, data); return; }
  if (opcode === OP.CLOSE) { console.log("[discord-rpc] Discord sent CLOSE"); handleDisconnect(); return; }
  if (opcode !== OP.FRAME) return;

  if (data.evt === "READY") {
    currentUser = data.data?.user;
    if (socket) socket.setTimeout(0);
    console.log(`[discord-rpc] Handshake OK — user: ${currentUser?.username || "unknown"}`);

    const cachedToken = loadToken();
    if (cachedToken) {
      console.log("[discord-rpc] Using cached token...");
      sendCommand("AUTHENTICATE", { access_token: cachedToken });
      return;
    }

    console.log("[discord-rpc] Attempting OAuth authorization...");
    waitingAuth = true;
    const challenge = generatePKCE();
    sendCommand("AUTHORIZE", { client_id: CLIENT_ID, scopes: SCOPES, code_challenge: challenge, code_challenge_method: "S256" });
    return;
  }

  if (data.cmd === "AUTHORIZE" && typeof data.data?.code === "number") {
    waitingAuth = false;
    console.log("[discord-rpc] OAuth scopes not approved yet — using keyboard shortcuts for voice control");
    console.log("[discord-rpc] To enable RPC voice control, get the app approved at Discord Developer Portal");
    authenticated = false;
    return;
  }

  if (data.cmd === "AUTHORIZE" && data.data?.code && typeof data.data.code === "string") {
    waitingAuth = false;
    const authCode = String(data.data.code);
    console.log("[discord-rpc] Got auth code (full):", authCode);
    console.log("[discord-rpc] AUTHORIZE response data:", JSON.stringify(data.data));
    try {
      const token = await exchangeCode(authCode);
      console.log("[discord-rpc] Token obtained, authenticating...");
      sendCommand("AUTHENTICATE", { access_token: token });
    } catch (e) {
      console.error("[discord-rpc] Token exchange failed:", e.message);
    }
    return;
  }

  if (data.cmd === "AUTHORIZE" && data.evt === "ERROR") {
    waitingAuth = false;
    console.log("[discord-rpc] Authorization denied by user");
    return;
  }

  if (data.cmd === "AUTHENTICATE" && data.data?.user) {
    authenticated = true;
    currentUser = data.data.user;
    console.log(`[discord-rpc] ✓ Authenticated as ${currentUser.username} — voice control enabled!`);

    sendCommand("SUBSCRIBE", {}, "VOICE_SETTINGS_UPDATE");

    sendCommand("GET_VOICE_SETTINGS", {});
    return;
  }

  if (data.cmd === "GET_VOICE_SETTINGS" || data.evt === "VOICE_SETTINGS_UPDATE") {
    const vs = data.data;
    if (vs) {
      voiceState.mute = !!vs.mute;
      voiceState.deaf = !!vs.deaf;
      console.log(`[discord-rpc] Voice — mute: ${voiceState.mute}, deaf: ${voiceState.deaf}`);
    }
    return;
  }

  if (data.evt === "ERROR") {
    const code = data.data?.code;
    const msg = data.data?.message;
    console.error(`[discord-rpc] Error (${code}): ${msg}`);
    if (code === 4002 || code === 4006) {
      console.log("[discord-rpc] Token invalid, clearing cache and re-authorizing...");
      try { fs.unlinkSync(TOKEN_PATH); } catch {}
      const challenge = generatePKCE();
    sendCommand("AUTHORIZE", { client_id: CLIENT_ID, scopes: SCOPES, code_challenge: challenge, code_challenge_method: "S256" });
    }
    return;
  }
}

function handleDisconnect() {
  authenticated = false;
  if (socket) { socket.destroy(); socket = null; }
  if (waitingAuth) {
    console.log("[discord-rpc] Connection lost during auth — retrying...");
    waitingAuth = false;
    if (!stopped) setTimeout(() => tryConnect(), 3000);
  } else {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  console.log("[discord-rpc] Reconnecting in 15s...");
  reconnectTimer = setTimeout(() => { reconnectTimer = null; tryConnect(); }, 15000);
}

module.exports = {
  onLoad() {
    console.log("[discord-rpc] Plugin loaded — connecting to Discord...");
    stopped = false;
    tryConnect();
  },

  onUnload() {
    console.log("[discord-rpc] Plugin unloading");
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket) { try { send(OP.CLOSE, {}); } catch {} socket.destroy(); socket = null; }
    authenticated = false;
  },

  async onAction(actionId) {
    if (actionId === "toggle_mute") {
      if (authenticated) {
        const newMute = !voiceState.mute;
        sendCommand("SET_VOICE_SETTINGS", { mute: newMute });
        voiceState.mute = newMute;
        console.log(`[discord-rpc] Mute → ${newMute}`);
      } else {
        console.log("[discord-rpc] Not authenticated, using keyboard fallback");
        sendDiscordKeystroke(0x4D);
      }
      return;
    }

    if (actionId === "toggle_deafen") {
      if (authenticated) {
        const newDeaf = !voiceState.deaf;
        sendCommand("SET_VOICE_SETTINGS", { deaf: newDeaf });
        voiceState.deaf = newDeaf;
        if (newDeaf) voiceState.mute = true;
        console.log(`[discord-rpc] Deafen → ${newDeaf}`);
      } else {
        console.log("[discord-rpc] Not authenticated, using keyboard fallback");
        sendDiscordKeystroke(0x44);
      }
      return;
    }

    if (actionId === "voice_status") {
      const status = authenticated ? "Connected" : "Disconnected";
      const user = currentUser ? currentUser.username : "—";
      const mute = voiceState.mute ? "MUTED" : "Unmuted";
      const deaf = voiceState.deaf ? "DEAFENED" : "Listening";
      console.log(`[discord-rpc] Status: ${status} | ${user} | ${mute} | ${deaf}`);
      return { authenticated, user: currentUser, mute: voiceState.mute, deaf: voiceState.deaf };
    }
  },

  getState() {
    return {
      "toggle_mute": voiceState.mute,
      "toggle_deafen": voiceState.deaf,
      authenticated,
      user: currentUser?.username || null,
    };
  },
};
