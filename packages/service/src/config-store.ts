import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { OrbitRingConfig, ButtonBinding, AppProfile, RingSettings, AppRingProfileMap } from "@orbitring/shared";
import { DEFAULT_GROUPS } from "@orbitring/shared/src/ring-catalog";
import { createTranslator, resolveLocale } from "@orbitring/shared/src/i18n";

const CONFIG_DIR = path.join(os.homedir(), ".orbit");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function defaultRing(locale: string = Intl.DateTimeFormat().resolvedOptions().locale): RingSettings {
  const t = createTranslator(resolveLocale(locale));
  return {
    groups: DEFAULT_GROUPS.map((g) => ({ id: g.id, name: t.dyn(`catalog.defaultGroups.${g.id}`), icon: g.icon, actions: [...g.actions] })),
    theme: "dark",
    size: 320,
    accent: "#8b5cf6",
    speed: 1,
    liquid: true,
    ascii: true,
  };
}

const DEFAULT_CONFIG: OrbitRingConfig = {
  version: 1,
  defaultProfile: {
    bindings: [
      {
        button: "side1",
        action: { type: "keystroke", key: "BrowserBack", modifiers: [], label: "Back" },
      },
      {
        button: "side2",
        action: { type: "keystroke", key: "BrowserForward", modifiers: [], label: "Forward" },
      },
    ],
  },
  appProfiles: [],
  devices: {},
};

const LEGACY_DISCORD_ACTIONS: Record<string, string | null> = {
  discord_mute: "plugin:com.orbitring.discord:toggle_mute",
  discord_deafen: "plugin:com.orbitring.discord:toggle_deafen",
  discord_screen: null,
};

const isLegacyDiscord = (id: unknown): id is string =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(LEGACY_DISCORD_ACTIONS, id);

export function migrateLegacyDiscordActions(config: OrbitRingConfig): boolean {
  let changed = false;
  const cfg = config as any;

  const groups = cfg?.ring?.groups;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!group || !Array.isArray(group.actions) || !group.actions.some(isLegacyDiscord)) continue;
      const next: string[] = [];
      for (const id of group.actions) {
        const mapped = isLegacyDiscord(id) ? LEGACY_DISCORD_ACTIONS[id] : id;
        if (mapped === null || next.includes(mapped)) continue;
        next.push(mapped);
      }
      group.actions = next;
      changed = true;
    }
  }

  const bindingLists: unknown[] = [cfg?.defaultProfile?.bindings];
  if (Array.isArray(cfg?.appProfiles)) {
    for (const profile of cfg.appProfiles) bindingLists.push(profile?.bindings);
  }
  for (const bindings of bindingLists) {
    if (!Array.isArray(bindings)) continue;
    for (const binding of bindings) {
      const action = binding?.action;
      if (!action || action.type !== "system" || !isLegacyDiscord(action.action)) continue;
      const mapped = LEGACY_DISCORD_ACTIONS[action.action];
      binding.action = mapped === null ? { type: "none" } : { ...action, action: mapped };
      changed = true;
    }
  }

  return changed;
}

export class ConfigStore {
  private config: OrbitRingConfig;
  private readonly configFile: string;

  constructor(configFile: string = CONFIG_FILE) {
    this.configFile = configFile;
    this.config = this.load();
  }

  getConfig(): OrbitRingConfig {
    return this.config;
  }

  getBinding(button: string, processName?: string): ButtonBinding | undefined {
    if (processName) {
      const profile = this.config.appProfiles.find(
        (p) => p.processMatch.toLowerCase() === processName.toLowerCase()
      );
      if (profile) {
        const binding = profile.bindings.find((b) => b.button === button);
        if (binding) return binding;
      }
    }
    return this.config.defaultProfile.bindings.find((b) => b.button === button);
  }

  saveBinding(profileId: string | null, binding: ButtonBinding) {
    if (profileId === null) {
      const idx = this.config.defaultProfile.bindings.findIndex(
        (b) => b.button === binding.button
      );
      if (idx >= 0) {
        this.config.defaultProfile.bindings[idx] = binding;
      } else {
        this.config.defaultProfile.bindings.push(binding);
      }
    } else {
      const profile = this.config.appProfiles.find((p) => p.id === profileId);
      if (profile) {
        const idx = profile.bindings.findIndex((b) => b.button === binding.button);
        if (idx >= 0) {
          profile.bindings[idx] = binding;
        } else {
          profile.bindings.push(binding);
        }
      }
    }
    this.save();
  }

  saveProfile(profile: AppProfile) {
    const idx = this.config.appProfiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.config.appProfiles[idx] = profile;
    } else {
      this.config.appProfiles.push(profile);
    }
    this.save();
  }

  deleteProfile(profileId: string) {
    this.config.appProfiles = this.config.appProfiles.filter(
      (p) => p.id !== profileId
    );
    this.save();
  }

  getRingSettings(): RingSettings {
    return this.config.ring ?? defaultRing();
  }

  saveRingSettings(ring: RingSettings) {
    this.config.ring = ring;
    this.save();
  }

  getAppRingProfiles(): AppRingProfileMap {
    return this.config.appRingProfiles ?? {};
  }

  setAppRingProfile(processName: string, groupId: string) {
    if (!this.config.appRingProfiles) {
      this.config.appRingProfiles = {};
    }
    this.config.appRingProfiles[processName] = groupId;
    this.save();
  }

  removeAppRingProfile(processName: string) {
    if (this.config.appRingProfiles) {
      delete this.config.appRingProfiles[processName];
      this.save();
    }
  }

  getGroupForProcess(processName: string): string | null {
    const profiles = this.config.appRingProfiles;
    if (!profiles) return null;
    const key = Object.keys(profiles).find(
      (k) => k.toLowerCase() === processName.toLowerCase()
    );
    return key ? profiles[key] : null;
  }

  private load(): OrbitRingConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, "utf-8");
        const config: OrbitRingConfig = JSON.parse(raw);
        if (migrateLegacyDiscordActions(config)) {
          console.log("[orbit] Migrated legacy Discord actions to the Discord plugin");
          this.config = config;
          this.save();
        }
        return config;
      }
    } catch (e) {
      console.error("[orbit] Failed to load config:", e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error("[orbit] Failed to save config:", e);
    }
  }
}
