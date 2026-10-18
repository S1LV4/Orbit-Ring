import { parentPort, workerData } from "worker_threads";
import { installMouseHook, removeMouseHook, waitMessage, currentThreadId } from "./win32-user32";
import { createMouseHookProc, THREAD_ID } from "./mouse-hook-proc";

const state: Int32Array = workerData.state;
const handle = installMouseHook(createMouseHookProc((out) => parentPort!.postMessage(out)));

if (!handle) {
  parentPort!.postMessage({ kind: "failed" });
} else {
  Atomics.store(state, THREAD_ID, currentThreadId());
  parentPort!.postMessage({ kind: "ready" });
  while (waitMessage()) {}
  removeMouseHook(handle);
}
