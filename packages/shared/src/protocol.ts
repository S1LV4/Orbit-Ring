import type { Action, DeviceInfo, AppProfile, ButtonBinding, RingSettings, AppRingProfileMap } from "./types";
import type { AgentStatus } from "./agents";
import type { PluginInfo, PluginStates, AttentionItem, PluginCatalogEntry } from "./plugin-types";

export type ServiceMessage =
  | { type: "devices"; devices: DeviceInfo[] }
  | { type: "button_event"; deviceId: string; button: string; action: "press" | "release"; x?: number; y?: number; timestamp: number }
  | { type: "active_app"; processName: string; title: string }
  | { type: "config_loaded"; config: unknown }
  | { type: "ring_config"; ring: RingSettings }
  | { type: "locale"; locale: string }
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
  | { type: "set_locale"; locale: string }
  | { type: "test_action"; action: Action }
  | { type: "start_macro_record" }
  | { type: "stop_macro_record" }
  | { type: "identify_button" }
  | { type: "warp_cursor"; x: number; y: number }
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
export const WS_HOST = "127.0.0.1";
export const WS_SUBPROTOCOL = "orbitring";
export const SERVICE_TOKEN_FILE = "service-token";
const TOKEN_PROTOCOL_PREFIX = "token.";

export const serviceUrl = (port: number = WS_PORT) => `ws://${WS_HOST}:${port}`;
export const serviceProtocols = (token: string) => [WS_SUBPROTOCOL, TOKEN_PROTOCOL_PREFIX + token];
export const tokenFromProtocols = (protocols: Iterable<string>): string | null => {
  for (const p of protocols) if (p.startsWith(TOKEN_PROTOCOL_PREFIX)) return p.slice(TOKEN_PROTOCOL_PREFIX.length);
  return null;
};
