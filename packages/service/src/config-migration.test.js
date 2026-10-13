const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const MUTE = "plugin:com.orbitring.discord:toggle_mute";
const DEAFEN = "plugin:com.orbitring.discord:toggle_deafen";

let tmp, file, ConfigStore, migrateLegacyDiscordActions, logSpy;

function writeConfig(cfg) {
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}
const readConfig = () => JSON.parse(fs.readFileSync(file, "utf-8"));

function baseConfig(extra = {}) {
  return {
    version: 1,
    defaultProfile: { bindings: [] },
    appProfiles: [],
    devices: {},
    ...extra,
  };
}

const ring = (groups) => ({ groups, theme: "dark", size: 320, accent: "#8b5cf6", speed: 1, liquid: true });

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-config-test-"));
  const out = path.join(tmp, "config-store.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "config-store.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: out,
    logLevel: "silent",
  });
  ({ ConfigStore, migrateLegacyDiscordActions } = require(out));
  file = path.join(tmp, "home", "config.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
});

beforeEach(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  fs.rmSync(file, { force: true });
});

afterEach(() => logSpy.mockRestore());

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("legacy Discord action migration", () => {
  test("the plugin still exposes the actions the migration points at", () => {
    const manifest = require("../../../plugins/discord-rpc/manifest.json");
    const ids = manifest.actions.map((a) => `plugin:${manifest.id}:${a.id}`);
    expect(ids).toEqual(expect.arrayContaining([MUTE, DEAFEN]));
  });

  test("ring groups: mute/deafen become plugin actions, screen is dropped, order kept", () => {
    writeConfig(baseConfig({
      ring: ring([
        { id: "voz", name: "Voz", icon: "discord", actions: ["copy", "discord_mute", "discord_screen", "discord_deafen", "paste"] },
        { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
      ]),
    }));

    const store = new ConfigStore(file);
    const groups = store.getRingSettings().groups;
    expect(groups[0].actions).toEqual(["copy", MUTE, DEAFEN, "paste"]);
    expect(groups[0].icon).toBe("discord");
    expect(groups[1].actions).toEqual(["copy", "paste", "undo"]);

    expect(readConfig().ring.groups[0].actions).toEqual(["copy", MUTE, DEAFEN, "paste"]);
    expect(JSON.stringify(readConfig())).not.toMatch(/discord_(mute|deafen|screen)/);
  });

  test("ring groups: de-duplicates when the plugin action is already in the group", () => {
    writeConfig(baseConfig({
      ring: ring([
        { id: "a", name: "A", icon: "discord", actions: [MUTE, "discord_mute", "discord_deafen", "discord_deafen"] },
        { id: "b", name: "B", icon: "discord", actions: ["discord_mute", "copy", MUTE] },
        { id: "c", name: "C", icon: "discord", actions: ["discord_screen"] },
      ]),
    }));

    const groups = new ConfigStore(file).getRingSettings().groups;
    expect(groups[0].actions).toEqual([MUTE, DEAFEN]);
    expect(groups[1].actions).toEqual([MUTE, "copy"]);
    expect(groups[2].actions).toEqual([]);
    expect(groups).toHaveLength(3);
  });

  test("button bindings: default and app profiles are rewritten; screen becomes none", () => {
    writeConfig(baseConfig({
      defaultProfile: {
        bindings: [
          { button: "side1", action: { type: "system", action: "discord_mute" } },
          { button: "side2", action: { type: "system", action: "discord_screen" } },
          { button: "middle", action: { type: "system", action: "volume_mute" } },
          { button: "side3", action: { type: "keystroke", key: "discord_mute", modifiers: [] } },
        ],
      },
      appProfiles: [
        { id: "p1", name: "Game", processMatch: "game.exe", bindings: [
          { button: "side1", action: { type: "system", action: "discord_deafen" } },
          { button: "side2", action: { type: "system", action: "discord_screen" } },
        ] },
      ],
    }));

    const store = new ConfigStore(file);
    expect(store.getBinding("side1").action).toEqual({ type: "system", action: MUTE });
    expect(store.getBinding("side2").action).toEqual({ type: "none" });
    expect(store.getBinding("middle").action).toEqual({ type: "system", action: "volume_mute" });
    expect(store.getBinding("side3").action).toEqual({ type: "keystroke", key: "discord_mute", modifiers: [] });
    expect(store.getBinding("side1", "GAME.EXE").action).toEqual({ type: "system", action: DEAFEN });
    expect(store.getBinding("side2", "game.exe").action).toEqual({ type: "none" });

    const saved = readConfig();
    expect(saved.defaultProfile.bindings[0].action).toEqual({ type: "system", action: MUTE });
    expect(saved.appProfiles[0].bindings[1].action).toEqual({ type: "none" });
  });

  test("nothing to migrate: the file is not rewritten", () => {
    const raw = JSON.stringify(baseConfig({
      ring: ring([{ id: "v", name: "Voz", icon: "discord", actions: [MUTE, DEAFEN, "copy"] }]),
      defaultProfile: { bindings: [{ button: "side1", action: { type: "system", action: MUTE } }] },
    }));
    fs.writeFileSync(file, raw);

    const store = new ConfigStore(file);
    expect(store.getRingSettings().groups[0].actions).toEqual([MUTE, DEAFEN, "copy"]);
    expect(fs.readFileSync(file, "utf-8")).toBe(raw);
  });

  test("migration is idempotent", () => {
    const cfg = baseConfig({
      ring: ring([{ id: "v", name: "Voz", icon: "discord", actions: ["discord_mute", "discord_screen"] }]),
      defaultProfile: { bindings: [{ button: "side1", action: { type: "system", action: "discord_deafen" } }] },
    });
    expect(migrateLegacyDiscordActions(cfg)).toBe(true);
    const once = JSON.parse(JSON.stringify(cfg));
    expect(migrateLegacyDiscordActions(cfg)).toBe(false);
    expect(cfg).toEqual(once);
  });

  test("missing file / config without ring: defaults load and nothing is written", () => {
    const store = new ConfigStore(file);
    expect(store.getRingSettings().groups.length).toBeGreaterThan(0);
    expect(fs.existsSync(file)).toBe(false);

    expect(migrateLegacyDiscordActions(baseConfig())).toBe(false);
    expect(migrateLegacyDiscordActions({})).toBe(false);
  });
});
