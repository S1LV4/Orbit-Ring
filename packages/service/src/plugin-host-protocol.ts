import type { AttentionItem, PluginInfo, PluginStates } from "@orbitring/shared";

export const MARKER_FD = 4;
export const SNAPSHOT_POLL_MS = 1000;

export interface HostConfig {
  pluginsDir: string;
  locale: string;
  unresponsive: string[];
}

export interface HostSnapshot {
  plugins: PluginInfo[];
  states: PluginStates;
  attention: AttentionItem[];
  dirs: Record<string, string>;
}

export type HostRequest = {
  id: number;
  method: "loadAll" | "loadFolder" | "unload" | "executePluginAction" | "setLocale" | "unloadAll";
  args: unknown[];
};

export type HostReply =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: HostSnapshot }
  | { type: "reply"; id: number; ok: true; value: unknown }
  | { type: "reply"; id: number; ok: false; error: string }
  | { type: "fault"; pluginId: string };
