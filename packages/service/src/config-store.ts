import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { MRingConfig, ButtonBinding, AppProfile, Action } from "@m-ring/shared";

const CONFIG_DIR = path.join(os.homedir(), ".m-ring");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

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
    // Check app-specific profile first
    if (processName) {
      const profile = this.config.appProfiles.find(
        (p) => p.processMatch.toLowerCase() === processName.toLowerCase()
      );
      if (profile) {
        const binding = profile.bindings.find((b) => b.button === button);
        if (binding) return binding;
      }
    }
    // Fall back to default profile
    return this.config.defaultProfile.bindings.find((b) => b.button === button);
  }

  saveBinding(profileId: string | null, binding: ButtonBinding) {
    if (profileId === null) {
      // Default profile
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

  private load(): MRingConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("[m-ring] Failed to load config:", e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save() {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error("[m-ring] Failed to save config:", e);
    }
  }
}
