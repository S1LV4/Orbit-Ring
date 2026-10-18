import path from "path";
import { Worker } from "worker_threads";
import { setCursorPos, postQuit } from "./win32-user32";
import { HOOK_STATE_SLOTS, THREAD_ID, type HookOutput, type MouseButtonEvent } from "./mouse-hook-proc";

export type { MouseButtonEvent };
export type MouseHookCallback = (event: MouseButtonEvent) => void;

const state = new Int32Array(new SharedArrayBuffer(HOOK_STATE_SLOTS * 4));

let hookThread: Worker | null = null;

export function warpCursor(x: number, y: number): void {
  setCursorPos(Math.round(x), Math.round(y));
}

export function startMouseHook(callback: MouseHookCallback): void {
  if (hookThread) {
    console.warn("[orbit] Mouse hook already running");
    return;
  }

  Atomics.store(state, THREAD_ID, 0);
  const thread = new Worker(path.join(__dirname, "mouse-hook-worker.js"), { workerData: { state } });
  hookThread = thread;
  thread.on("message", (msg: HookOutput | { kind: "ready" | "failed" }) => {
    try {
      if (msg.kind === "button") callback(msg.event);
      else if (msg.kind === "ready") console.log("[orbit] Win32 mouse hook installed");
      else console.error("[orbit] Failed to set mouse hook");
    } catch {}
  });
  thread.on("error", (e) => console.error("[orbit] Mouse hook thread error:", e));
  thread.on("exit", () => { if (hookThread === thread) hookThread = null; });
}

export function stopMouseHook(): void {
  const thread = hookThread;
  if (!thread) return;
  hookThread = null;
  const threadId = Atomics.load(state, THREAD_ID);
  if (threadId) postQuit(threadId);
  else thread.terminate();
  console.log("[orbit] Mouse hook removed");
}
