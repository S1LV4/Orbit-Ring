import koffi from "koffi";

/**
 * Windows Low-Level Mouse Hook using Win32 API via koffi.
 *
 * Captures ALL mouse button events system-wide, including:
 * - XButton1 (mouse4 / back / side1)
 * - XButton2 (mouse5 / forward / side2)
 * - Middle button
 *
 * Does NOT require admin privileges.
 * Works with any mouse (Logitech, Razer, generic, etc.)
 */

// Win32 constants
const WH_MOUSE_LL = 14;
const WM_MOUSEMOVE = 0x0200;
const WM_XBUTTONDOWN = 0x020b;
const WM_XBUTTONUP = 0x020c;
const WM_MBUTTONDOWN = 0x0207;
const WM_MBUTTONUP = 0x0208;
const XBUTTON1 = 0x0001;
const XBUTTON2 = 0x0002;

// Load user32.dll
const user32 = koffi.load("user32.dll");

// Define MSLLHOOKSTRUCT
const MSLLHOOKSTRUCT = koffi.struct("MSLLHOOKSTRUCT", {
  x: "int32",
  y: "int32",
  mouseData: "uint32",
  flags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
});

// Define callback type for the hook procedure
const HOOKPROC = koffi.proto("HOOKPROC", "intptr", ["int", "uintptr", "intptr"]);
const HOOKPROC_PTR = koffi.pointer(HOOKPROC);

// Win32 functions
const SetWindowsHookExW = user32.func(
  "SetWindowsHookExW",
  "intptr",
  ["int", HOOKPROC_PTR, "intptr", "uint32"]
);

const CallNextHookEx = user32.func(
  "CallNextHookEx",
  "intptr",
  ["intptr", "int", "uintptr", "intptr"]
);

const UnhookWindowsHookEx = user32.func(
  "UnhookWindowsHookEx",
  "int",
  ["intptr"]
);

const PeekMessageW = user32.func("PeekMessageW", "int", [
  "void *",
  "intptr",
  "uint32",
  "uint32",
  "uint32",
]);

export type MouseButtonEvent = {
  button: string;
  action: "press" | "release";
  x?: number;
  y?: number;
  timestamp: number;
};

export type MouseHookCallback = (event: MouseButtonEvent) => void;

/** Set of buttons to CONSUME (block from reaching apps) */
const consumedButtons = new Set<string>(["side2"]);

/** Add a button to the consumed set — its events won't reach other apps */
export function consumeButton(button: string) {
  consumedButtons.add(button);
}

/** Remove a button from the consumed set */
export function releaseButton(button: string) {
  consumedButtons.delete(button);
}

let hookHandle: any = null;
let callbackRef: any = null;
let pumpInterval: ReturnType<typeof setInterval> | null = null;

export function startMouseHook(callback: MouseHookCallback): void {
  if (hookHandle) {
    console.warn("[m-ring] Mouse hook already running");
    return;
  }

  callbackRef = koffi.register(
    (nCode: number, wParam: number, lParam: number): number => {
      if (nCode >= 0 && lParam) {
        const buf = koffi.decode(lParam, MSLLHOOKSTRUCT);
        const event = parseMouseEvent(wParam, buf);
        if (event) {
          try {
            callback(event);
          } catch {}

          // CONSUME the event: return 1 to block the OS from processing it
          // This prevents "browser forward/back" from firing
          if (consumedButtons.has(event.button)) {
            return 1;
          }
        }
      }
      return CallNextHookEx(hookHandle || 0, nCode, wParam, lParam);
    },
    HOOKPROC_PTR
  );

  hookHandle = SetWindowsHookExW(WH_MOUSE_LL, callbackRef, 0, 0);

  if (!hookHandle) {
    console.error("[m-ring] Failed to set mouse hook");
    return;
  }

  console.log("[m-ring] Win32 mouse hook installed");

  const msgBuf = Buffer.alloc(48);
  pumpInterval = setInterval(() => {
    while (PeekMessageW(msgBuf, 0, 0, 0, 1)) {
      // message consumed
    }
  }, 5);
}

export function stopMouseHook(): void {
  if (pumpInterval) {
    clearInterval(pumpInterval);
    pumpInterval = null;
  }
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle);
    hookHandle = null;
    console.log("[m-ring] Mouse hook removed");
  }
}

function parseMouseEvent(
  wParam: number,
  lParam: { x: number; y: number; mouseData: number; time: number }
): MouseButtonEvent | null {
  const hiWord = (lParam.mouseData >> 16) & 0xffff;

  switch (wParam) {
    case WM_XBUTTONDOWN:
      return {
        button: hiWord === XBUTTON1 ? "side1" : "side2",
        action: "press",
        x: lParam.x,
        y: lParam.y,
        timestamp: lParam.time,
      };
    case WM_XBUTTONUP:
      return {
        button: hiWord === XBUTTON1 ? "side1" : "side2",
        action: "release",
        x: lParam.x,
        y: lParam.y,
        timestamp: lParam.time,
      };
    case WM_MBUTTONDOWN:
      return { button: "middle", action: "press", x: lParam.x, y: lParam.y, timestamp: lParam.time };
    case WM_MBUTTONUP:
      return { button: "middle", action: "release", x: lParam.x, y: lParam.y, timestamp: lParam.time };
    default:
      return null;
  }
}
