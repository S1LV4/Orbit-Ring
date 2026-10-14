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
    | "task_view";
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

export interface ButtonBinding {
  button: MouseButton;
  action: Action;
}

export interface AppProfile {
  id: string;
  name: string;
  processMatch: string;
  bindings: ButtonBinding[];
  icon?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  vendorId: number;
  productId: number;
  manufacturer?: string;
  path: string;
  buttonCount?: number;
}

export interface RingGroup {
  id: string;
  name: string;
  icon: string;
  actions: string[];
}

export type RingTheme = "dark" | "orange" | "neg-orange" | "neg" | "light";

export interface RingSettings {
  groups: RingGroup[];
  theme: RingTheme;
  size: number;
  accent: string;
  speed: number;
  liquid: boolean;
  ascii?: boolean;
}

export interface ClaudeUsageTier {
  used: number;
  limit: number;
  percent: number;
  resetsAt?: number;
}

export interface ClaudeUsage {
  available: boolean;
  session: ClaudeUsageTier;
  weekly: ClaudeUsageTier;
  status: "green" | "amber" | "red";
}

export type AppRingProfileMap = Record<string, string>;

export interface OrbitRingConfig {
  version: 1;
  defaultProfile: {
    bindings: ButtonBinding[];
  };
  appProfiles: AppProfile[];
  devices: Record<string, { name?: string; enabled: boolean }>;
  ring?: RingSettings;
  appRingProfiles?: AppRingProfileMap;
  locale?: string;
}
