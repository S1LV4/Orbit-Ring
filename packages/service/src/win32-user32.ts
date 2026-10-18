import koffi from "koffi";

const WH_MOUSE_LL = 14;
const WM_QUIT = 0x0012;

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const MSLLHOOKSTRUCT = koffi.struct("MSLLHOOKSTRUCT", {
  x: "int32",
  y: "int32",
  mouseData: "uint32",
  flags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
});

const HOOKPROC = koffi.proto("HOOKPROC", "intptr", ["int", "uintptr", "intptr"]);
const HOOKPROC_PTR = koffi.pointer(HOOKPROC);

const SetWindowsHookExW = user32.func("SetWindowsHookExW", "intptr", ["int", HOOKPROC_PTR, "intptr", "uint32"]);
const CallNextHookEx = user32.func("CallNextHookEx", "intptr", ["intptr", "int", "uintptr", "intptr"]);
const UnhookWindowsHookEx = user32.func("UnhookWindowsHookEx", "int", ["intptr"]);
const PeekMessageW = user32.func("PeekMessageW", "int", ["void *", "intptr", "uint32", "uint32", "uint32"]);
const GetMessageW = user32.func("GetMessageW", "int", ["void *", "intptr", "uint32", "uint32"]);
const PostThreadMessageW = user32.func("PostThreadMessageW", "int", ["uint32", "uint32", "uintptr", "intptr"]);
const SetCursorPos = user32.func("SetCursorPos", "int", ["int", "int"]);
const GetCurrentThreadId = kernel32.func("GetCurrentThreadId", "uint32", []);

export type HookProc = (nCode: number, wParam: number, lParam: number) => number;
export type MouseHookInfo = { x: number; y: number; mouseData: number; flags: number; time: number };

const msgBuf = Buffer.alloc(48);
const registered = new Map<number, unknown>();

export function installMouseHook(proc: HookProc): number {
  PeekMessageW(msgBuf, 0, 0, 0, 0);
  const callback = koffi.register(proc, HOOKPROC_PTR);
  const handle = Number(SetWindowsHookExW(WH_MOUSE_LL, callback, 0, 0));
  if (!handle) {
    koffi.unregister(callback);
    return 0;
  }
  registered.set(handle, callback);
  return handle;
}

export function removeMouseHook(handle: number): void {
  UnhookWindowsHookEx(handle);
  const callback = registered.get(handle);
  if (callback) koffi.unregister(callback as any);
  registered.delete(handle);
}

export function callNextHook(nCode: number, wParam: number, lParam: number): number {
  return Number(CallNextHookEx(0, nCode, wParam, lParam));
}

export function readHookInfo(lParam: number): MouseHookInfo {
  return koffi.decode(lParam, MSLLHOOKSTRUCT);
}

export function waitMessage(): boolean {
  return GetMessageW(msgBuf, 0, 0, 0) > 0;
}

export function currentThreadId(): number {
  return GetCurrentThreadId();
}

export function postQuit(threadId: number): void {
  PostThreadMessageW(threadId, WM_QUIT, 0, 0);
}

export function setCursorPos(x: number, y: number): void {
  SetCursorPos(x, y);
}
