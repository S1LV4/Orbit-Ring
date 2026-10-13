import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { MRingConfig, ButtonBinding, AppProfile, RingSettings, AppRingProfileMap } from "@m-ring/shared";

const CONFIG_DIR = path.join(os.homedir(), ".orbit");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_RING: RingSettings = {
  groups: [
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
    { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward", "refresh"] },
    { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
    { id: "media", name: "Mídia", icon: "music", actions: ["playpause", "volmute"] },
    { id: "cap", name: "Captura", icon: "aperture", actions: ["screenshot"] },
    { id: "sys", name: "Sistema", icon: "settings", actions: ["save", "explorer", "find"] },
  ],
  theme: "dark",
  size: 320,
  accent: "#8b5cf6",
  speed: 1,
  liquid: true,
};

const DEFAULT_CONFIG: MRingConfig = {
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

export class ConfigStore {
  private config: MRingConfig;

  constructor() {
    this.config = this.load();
  }

  getConfig(): MRingConfig {
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
    return this.config.ring ?? DEFAULT_RING;
  }

  saveRingSettings(ring: RingSettings) {
    this.config.ring = ring;
    this.save();
  }

  // --- App Ring Profiles (auto-switch ring group by focused app) ---

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

  /** Look up the ring group ID mapped to a process name (case-insensitive). */
  getGroupForProcess(processName: string): string | null {
    const profiles = this.config.appRingProfiles;
    if (!profiles) return null;
    const key = Object.keys(profiles).find(
      (k) => k.toLowerCase() === processName.toLowerCase()
    );
    return key ? profiles[key] : null;
  }

  private load(): MRingConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("[orbit] Failed to load config:", e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save() {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error("[orbit] Failed to save config:", e);
    }
  }
}
