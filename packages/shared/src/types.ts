/** A physical mouse button identifier */
export type MouseButton =
  | "left"
  | "right"
  | "middle"
  | "side1"
  | "side2"
  | "side3"
  | "side4"
  | "dpi"
  | "scroll_left"
  | "scroll_right";

/** Action types — modeled after Logi Options+ card system */
export type ActionType = "keystroke" | "system" | "command" | "macro" | "none";

export interface KeystrokeAction {
  type: "keystroke";
  key: string;
  modifiers: ("ctrl" | "shift" | "alt" | "meta")[];
  label?: string;
}

export interface SystemAction {
  type: "system";
  action:
    | "volume_up"
    | "volume_down"
    | "volume_mute"
    | "media_play_pause"
    | "media_next"
    | "media_prev"
    | "brightness_up"
    | "brightness_down"
    | "screenshot"
    | "lock_screen"
    | "open_file_manager"
    | "open_browser"
    | "open_terminal"
    | "minimize_window"
    | "maximize_window"
    | "close_window"
    | "switch_desktop_left"
    | "switch_desktop_right"
    | "show_desktop"
    | "task_view"
    | "discord_mute"
    | "discord_deafen"
    | "discord_screen";
}

export interface CommandAction {
  type: "command";
  command: string;
  args?: string[];
  label?: string;
}

export interface MacroStep {
  type: "key_down" | "key_up" | "delay";
  key?: string;
  modifiers?: ("ctrl" | "shift" | "alt" | "meta")[];
  duration?: number;
}

export interface MacroAction {
  type: "macro";
  name: string;
  steps: MacroStep[];
  repeat?: number;
}

export interface NoAction {
  type: "none";
}

export type Action =
  | KeystrokeAction
  | SystemAction
  | CommandAction
  | MacroAction
  | NoAction;

/** Button binding — maps a mouse button to an action */
export interface ButtonBinding {
  button: MouseButton;
  action: Action;
}

/** Application-specific profile */
export interface AppProfile {
  id: string;
  name: string;
  /** Executable name or path pattern to match (e.g. "code.exe", "chrome.exe") */
  processMatch: string;
  bindings: ButtonBinding[];
  icon?: string;
}

/** Device info detected by the service */
export interface DeviceInfo {
  id: string;
  name: string;
  vendorId: number;
  productId: number;
  manufacturer?: string;
  path: string;
  buttonCount?: number;
}

/** A ring group containing action IDs */
export interface RingGroup {
  id: string;
  name: string;
  icon: string; // icon ID from catalog
  actions: string[]; // action IDs
}

export type RingTheme = "dark" | "light";

export interface RingSettings {
  groups: RingGroup[];
  theme: RingTheme;
  size: number;
  accent: string; // hex color
  speed: number; // animation speed multiplier (0.5–2)
  liquid: boolean; // goo/liquid effect
}

/** Claude Code usage tier (session or weekly) */
export interface ClaudeUsageTier {
  used: number;
  limit: number;
  percent: number;
  resetsAt?: number;
}

/** Claude Code usage tracking result */
export interface ClaudeUsage {
  available: boolean;
  session: ClaudeUsageTier;
  weekly: ClaudeUsageTier;
  status: "green" | "amber" | "red";
}

/** Maps process names to ring group IDs for auto-switch */
export type AppRingProfileMap = Record<string, string>;

/** Top-level user configuration */
export interface MRingConfig {
  version: 1;
  defaultProfile: {
    bindings: ButtonBinding[];
  };
  appProfiles: AppProfile[];
  devices: Record<string, { name?: string; enabled: boolean }>;
  ring?: RingSettings;
  /** Maps process names → ring group IDs for auto-switch on focused window change */
  appRingProfiles?: AppRingProfileMap;
}
