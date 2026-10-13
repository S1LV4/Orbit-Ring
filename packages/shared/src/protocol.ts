import type { Action, DeviceInfo, AppProfile, ButtonBinding, RingSettings, AppRingProfileMap } from "./types";
import type { AgentStatus } from "./agents";
import type { PluginInfo, PluginStates, AttentionItem, PluginCatalogEntry } from "./plugin-types";

export type ServiceMessage =
  | { type: "devices"; devices: DeviceInfo[] }
  | { type: "button_event"; deviceId: string; button: string; action: "press" | "release"; x?: number; y?: number; timestamp: number }
  | { type: "active_app"; processName: string; title: string }
  | { type: "config_loaded"; config: unknown }
  | { type: "ring_config"; ring: RingSettings }
  | { type: "agents"; agents: AgentStatus[] }
  | { type: "claude_usage"; usage: import("./types").ClaudeUsage }
  | { type: "app_ring_profiles"; profiles: AppRingProfileMap }
  | { type: "profile_switch"; processName: string; groupId: string | null }
  | { type: "plugins"; plugins: PluginInfo[] }
  | { type: "plugin_states"; states: PluginStates }
  | { type: "plugin_catalog"; plugins: PluginCatalogEntry[] }
  | { type: "attention"; items: AttentionItem[] }
  | { type: "error"; message: string };

export type UIMessage =
  | { type: "get_devices" }
  | { type: "get_config" }
  | { type: "get_agents" }
  | { type: "save_binding"; profileId: string | null; binding: ButtonBinding }
  | { type: "save_profile"; profile: AppProfile }
  | { type: "delete_profile"; profileId: string }
  | { type: "save_ring"; ring: RingSettings }
  | { type: "test_action"; action: Action }
  | { type: "start_macro_record" }
  | { type: "stop_macro_record" }
  | { type: "identify_button" }
  | { type: "get_claude_usage" }
  | { type: "get_plugins" }
  | { type: "open_plugins_folder" }
  | { type: "get_plugin_catalog" }
  | { type: "install_plugin"; pluginId: string }
  | { type: "remove_plugin"; pluginId: string }
  | { type: "get_plugin_states" }
  | { type: "get_attention" }
  | { type: "execute_plugin_action"; pluginId: string; actionId: string }
  | { type: "get_app_ring_profiles" }
  | { type: "set_app_ring_profile"; processName: string; groupId: string }
  | { type: "remove_app_ring_profile"; processName: string };

export const WS_PORT = 9119;
