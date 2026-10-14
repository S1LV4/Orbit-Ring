process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/discord-rpc");
const plugin = require(path.join(PLUGIN_DIR, "index.js"));

function frame(opcode, data) {
  const json = JSON.stringify(data);
  const buf = Buffer.alloc(8 + Buffer.byteLength(json));
  buf.writeUInt32LE(opcode, 0);
  buf.writeUInt32LE(Buffer.byteLength(json), 4);
  buf.write(json, 8);
  return buf;
}
function parseFrames(buf) {
  const out = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off + 4);
    out.push({ opcode: buf.readUInt32LE(off), data: JSON.parse(buf.slice(off + 8, off + 8 + len).toString("utf8")) });
    off += 8 + len;
  }
  return out;
}

function fakeDiscord({ running = true } = {}) {
  const d = { sent: [], socket: null, connects: 0 };
  d.connect = (pipePath, onConnect) => {
    d.connects++;
    const s = new EventEmitter();
    s.destroyed = false;
    s.write = (buf) => { d.sent.push(...parseFrames(buf)); return true; };
    s.destroy = () => { s.destroyed = true; };
    s.setTimeout = () => s;
    setImmediate(() => {
      if (!running || !pipePath.endsWith("-0")) s.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
      else { d.socket = s; onConnect(); }
    });
    return s;
  };
  d.reply = (data) => d.socket.emit("data", frame(1, data));
  d.commands = (cmd) => d.sent.filter((f) => f.opcode === 1 && f.data.cmd === cmd);
  return d;
}

const flush = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 15; i++) await flush(); }

let tmp, discord, host, logSpy, errSpy, keystrokes, posts;

function start({ running = true, token = null, post } = {}) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-discord-"));
  const tokenPath = path.join(tmp, "credentials.json");
  if (token) fs.writeFileSync(tokenPath, JSON.stringify(token));
  discord = fakeDiscord({ running });
  keystrokes = [];
  posts = [];
  plugin.__test.configure({
    connect: discord.connect,
    tokenPath,
    keystroke: (vk) => keystrokes.push(vk),
    postForm: async (url, params) => { posts.push({ url, params }); return post ? post(url, params) : { access_token: "tok-new", refresh_token: "ref-new", expires_in: 604800 }; },
  });
  host = { locale: "pt-BR", states: 0, attention: [], stateChanged() { this.states++; } };
  host.attentionFn = (item) => host.attention.push(item);
  plugin.onLoad({ locale: host.locale, stateChanged: () => host.stateChanged(), attention: host.attentionFn });
  return tokenPath;
}

const ready = () => discord.reply({ evt: "READY", data: { user: { username: "ada" } } });
const state = () => plugin.getState();

beforeEach(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  plugin.onUnload();
  plugin.__test.configure({});
  logSpy.mockRestore();
  errSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Discord closed: the buttons say so", async () => {
  start({ running: false });
  await settle();
  expect(state().toggle_mute).toMatchObject({ active: false, label: "Discord fechado" });
  expect(state().toggle_deafen).toMatchObject({ label: "Discord fechado" });
});

test("no token yet: asks Discord for authorization and the buttons tell the user to approve it there", async () => {
  start();
  await settle();
  ready();
  await settle();
  expect(discord.commands("AUTHORIZE")).toHaveLength(1);
  expect(state().toggle_mute).toMatchObject({ status: "amber", label: "Discord · aprove o OrbitRing na janela do Discord" });
});

test("the user refuses in Discord: red buttons, a notice, and a click asks again", async () => {
  start();
  await settle();
  ready();
  await settle();
  discord.reply({ cmd: "AUTHORIZE", evt: "ERROR", data: { code: 5000, message: "OAuth2 Error: user cancelled" } });
  await settle();
  expect(state().toggle_mute).toMatchObject({ status: "red", label: "Discord · autorização recusada — clique para autorizar" });
  expect(host.attention).toEqual([expect.objectContaining({ id: "discord-auth", title: "Discord não autorizado" })]);
  await plugin.onAction("toggle_mute");
  expect(discord.commands("AUTHORIZE")).toHaveLength(2);
  expect(keystrokes).toEqual([]);
  expect(state().toggle_mute).toMatchObject({ status: "amber" });
});

test("Discord refuses voice control for the app: red, and a click asks again — no keyboard shortcuts", async () => {
  start();
  await settle();
  ready();
  await settle();
  discord.reply({ cmd: "AUTHORIZE", data: { code: 4006 } });
  await settle();
  expect(state().toggle_mute).toMatchObject({ status: "red", label: "Discord · controle de voz não liberado — clique para tentar de novo" });
  await plugin.onAction("toggle_deafen");
  expect(keystrokes).toEqual([]);
  expect(discord.commands("AUTHORIZE")).toHaveLength(2);
});

test("never falls back to keyboard shortcuts, in any state", async () => {
  start({ running: false });
  await settle();
  await plugin.onAction("toggle_mute");
  await plugin.onAction("toggle_deafen");
  expect(keystrokes).toEqual([]);
});

test("the plugin list shows whether Discord is authorized, with an Authorize button when it is not", async () => {
  start();
  await settle();
  expect(plugin.getStatus()).toEqual({ tone: "neutral", text: "Conectando ao Discord…" });
  ready();
  await settle();
  expect(plugin.getStatus()).toEqual({ tone: "warn", text: "Aguardando sua aprovação na janela do Discord" });
  discord.reply({ cmd: "AUTHORIZE", evt: "ERROR", data: { code: 5000 } });
  await settle();
  expect(plugin.getStatus()).toEqual({ tone: "error", text: "Não autorizado", action: { id: "authorize", label: "Autorizar" } });
  await plugin.onAction("authorize");
  expect(discord.commands("AUTHORIZE")).toHaveLength(2);
  discord.reply({ cmd: "AUTHORIZE", data: { code: "abc" } });
  await settle();
  discord.reply({ cmd: "AUTHENTICATE", data: { user: { username: "ada" } } });
  await settle();
  expect(plugin.getStatus()).toEqual({ tone: "ok", text: "Autorizado como ada" });
});

test("the plugin list says when Discord is closed", async () => {
  start({ running: false });
  await settle();
  expect(plugin.getStatus()).toEqual({ tone: "neutral", text: "Discord fechado" });
});

test("approved: the code becomes a token, never logged; voice control by RPC, notice cleared", async () => {
  start();
  await settle();
  ready();
  await settle();
  discord.reply({ cmd: "AUTHORIZE", data: { code: "secret-oauth-code" } });
  await settle();
  expect(posts.map((p) => p.params.grant_type)).toEqual(["authorization_code"]);
  expect(discord.commands("AUTHENTICATE").map((f) => f.data.args.access_token)).toEqual(["tok-new"]);
  discord.reply({ cmd: "AUTHENTICATE", data: { user: { username: "ada" } } });
  discord.reply({ cmd: "GET_VOICE_SETTINGS", data: { mute: true, deaf: false } });
  await settle();
  expect(state().toggle_mute).toMatchObject({ active: true, label: "Discord · microfone mudo" });
  expect(state().toggle_deafen).toMatchObject({ active: false, label: "Discord · áudio ligado" });
  expect(state().toggle_mute.status).toBeUndefined();
  await plugin.onAction("toggle_mute");
  expect(discord.commands("SET_VOICE_SETTINGS").map((f) => f.data.args)).toEqual([{ mute: false }]);
  expect(keystrokes).toEqual([]);
  const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join("\n");
  expect(logged).not.toContain("secret-oauth-code");
  expect(logged).not.toContain("tok-new");
});

test("a failed token exchange is an error state, not silence", async () => {
  start({ post: () => ({ error: "invalid_grant" }) });
  await settle();
  ready();
  await settle();
  discord.reply({ cmd: "AUTHORIZE", data: { code: "abc" } });
  await settle();
  expect(state().toggle_mute).toMatchObject({ status: "red", label: "Discord · falha ao autorizar — clique para tentar de novo" });
  expect(host.attention.map((a) => a.id)).toEqual(["discord-auth"]);
});

test("a saved token is reused", async () => {
  start({ token: { access_token: "tok-saved", refresh_token: "r", expires_at: Date.now() + 3600_000 } });
  await settle();
  ready();
  await settle();
  expect(discord.commands("AUTHORIZE")).toHaveLength(0);
  expect(discord.commands("AUTHENTICATE").map((f) => f.data.args.access_token)).toEqual(["tok-saved"]);
});

test("an expired token is refreshed before authenticating (the refresh is awaited)", async () => {
  start({ token: { access_token: "old", refresh_token: "ref-old", expires_at: Date.now() - 1000 } });
  await settle();
  ready();
  await settle();
  expect(posts.map((p) => p.params.grant_type)).toEqual(["refresh_token"]);
  expect(discord.commands("AUTHENTICATE").map((f) => f.data.args.access_token)).toEqual(["tok-new"]);
});

test("a refresh that fails falls back to asking for authorization", async () => {
  start({ token: { access_token: "old", refresh_token: "ref-old", expires_at: Date.now() - 1000 }, post: () => ({ error: "invalid_grant" }) });
  await settle();
  ready();
  await settle();
  expect(discord.commands("AUTHENTICATE")).toHaveLength(0);
  expect(discord.commands("AUTHORIZE")).toHaveLength(1);
});

test("any authentication error drops the saved token and asks again", async () => {
  const tokenPath = start({ token: { access_token: "tok-saved", refresh_token: "r", expires_at: Date.now() + 3600_000 } });
  await settle();
  ready();
  await settle();
  discord.reply({ cmd: "AUTHENTICATE", evt: "ERROR", data: { code: 4009, message: "Invalid token" } });
  await settle();
  expect(fs.existsSync(tokenPath)).toBe(false);
  expect(discord.commands("AUTHORIZE")).toHaveLength(1);
  expect(state().toggle_mute).toMatchObject({ status: "amber" });
});

test("speaks the app language", async () => {
  start({ running: false });
  await settle();
  try {
    plugin.onLocaleChanged("en-US");
    expect(state().toggle_mute.label).toBe("Discord is not running");
    plugin.onLocaleChanged("es-ES");
    expect(state().toggle_mute.label).toBe("Discord está cerrado");
  } finally {
    plugin.onLocaleChanged("pt-BR");
  }
});
