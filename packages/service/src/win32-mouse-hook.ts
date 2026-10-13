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

export type MouseMoveEvent = {
  dx: number;
  dy: number;
};

export type MouseHookCallback = (event: MouseButtonEvent) => void;
export type MouseMoveCallback = (event: MouseMoveEvent) => void;

// Win32 functions for cursor lock
const SetCursorPos = user32.func("SetCursorPos", "int", ["int", "int"]);
const GetCursorPos = user32.func("GetCursorPos", "int", ["void *"]);
const ClipCursor = user32.func("ClipCursor", "int", ["void *"]);

/** Set of buttons to CONSUME (block from reaching apps) */
const consumedButtons = new Set<string>(["side2"]);

let hookHandle: any = null;
let callbackRef: any = null;
let pumpInterval: ReturnType<typeof setInterval> | null = null;

// Cursor lock state
let cursorLocked = false;
let lockX = 0;
let lockY = 0;
let moveCallback: MouseMoveCallback | null = null;
let lockSafetyTimer: ReturnType<typeof setTimeout> | null = null;

const LOCK_SAFETY_TIMEOUT_MS = 30000;

/** Lock cursor at its current position. Mouse deltas are sent to the move callback. */
export function lockCursor(onMove: MouseMoveCallback): void {
  const buf = Buffer.alloc(8);
  GetCursorPos(buf);
  lockX = buf.readInt32LE(0);
  lockY = buf.readInt32LE(4);
  moveCallback = onMove;
  cursorLocked = true;
  // Don't use ClipCursor — it prevents delta generation
  // Instead, SetCursorPos resets position in the hook callback

  // Safety: auto-unlock after timeout in case release event is lost
  if (lockSafetyTimer) clearTimeout(lockSafetyTimer);
  lockSafetyTimer = setTimeout(() => {
    if (cursorLocked) {
      console.warn("[orbit] Safety timeout: auto-unlocking cursor after " + LOCK_SAFETY_TIMEOUT_MS + "ms");
      unlockCursor();
    }
  }, LOCK_SAFETY_TIMEOUT_MS);
}

/** Unlock cursor — restore normal mouse movement */
export function unlockCursor(): void {
  cursorLocked = false;
  moveCallback = null;
  if (lockSafetyTimer) {
    clearTimeout(lockSafetyTimer);
    lockSafetyTimer = null;
  }
  // Release clip — pass null to restore full screen movement
  ClipCursor(null);
}

export function startMouseHook(callback: MouseHookCallback): void {
  if (hookHandle) {
    console.warn("[orbit] Mouse hook already running");
    return;
  }

  callbackRef = koffi.register(
    (nCode: number, wParam: number, lParam: number): number => {
      // SAFETY: always call CallNextHookEx on any error — never block clicks by accident
      try {
        if (nCode >= 0 && lParam) {
          const buf = koffi.decode(lParam, MSLLHOOKSTRUCT);

          // Handle cursor lock: intercept mouse movement and send deltas
          if (cursorLocked && wParam === WM_MOUSEMOVE) {
            // Skip events injected by our own SetCursorPos (flags bit 0 = injected)
            if (buf.flags & 1) {
              return CallNextHookEx(hookHandle || 0, nCode, wParam, lParam);
            }
            const dx = buf.x - lockX;
            const dy = buf.y - lockY;
            if (dx !== 0 || dy !== 0) {
              SetCursorPos(lockX, lockY);
              if (moveCallback) {
                try { moveCallback({ dx, dy }); } catch {}
              }
            }
            return 1;
          }

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
      } catch (e) {
        // On ANY error, pass the event through — never block the user's mouse
        console.error("[orbit] Hook callback error, passing event through:", e);
      }
      return CallNextHookEx(hookHandle || 0, nCode, wParam, lParam);
    },
    HOOKPROC_PTR
  );

  hookHandle = SetWindowsHookExW(WH_MOUSE_LL, callbackRef, 0, 0);

  if (!hookHandle) {
    console.error("[orbit] Failed to set mouse hook");
    return;
  }

  console.log("[orbit] Win32 mouse hook installed");

  const msgBuf = Buffer.alloc(48);
  pumpInterval = setInterval(() => {
    while (PeekMessageW(msgBuf, 0, 0, 0, 1)) {
      // message consumed
    }
  }, 8);
}

export function stopMouseHook(): void {
  // Always release cursor clip on shutdown
  unlockCursor();
  if (pumpInterval) {
    clearInterval(pumpInterval);
    pumpInterval = null;
  }
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle);
    hookHandle = null;
    console.log("[orbit] Mouse hook removed");
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
