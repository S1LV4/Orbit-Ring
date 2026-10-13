import type { Action, DeviceInfo, AppProfile, ButtonBinding } from "./types";

/** Messages sent FROM service TO UI */
export type ServiceMessage =
  | { type: "devices"; devices: DeviceInfo[] }
  | { type: "button_event"; deviceId: string; button: string; action: "press" | "release"; x?: number; y?: number; timestamp: number }
  | { type: "active_app"; processName: string; title: string }
  | { type: "config_loaded"; config: unknown }
  | { type: "error"; message: string };

/** Messages sent FROM UI TO service */
export type UIMessage =
  | { type: "get_devices" }
  | { type: "get_config" }
  | { type: "save_binding"; profileId: string | null; binding: ButtonBinding }
  | { type: "save_profile"; profile: AppProfile }
  | { type: "delete_profile"; profileId: string }
  | { type: "test_action"; action: Action }
  | { type: "start_macro_record" }
  | { type: "stop_macro_record" }
  | { type: "identify_button" };

export const WS_PORT = 9119;
export const WS_URL = `ws://localhost:${WS_PORT}`;
