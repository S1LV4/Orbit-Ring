import { callNextHook, readHookInfo, type HookProc, type MouseHookInfo } from "./win32-user32";

const WM_XBUTTONDOWN = 0x020b;
const WM_XBUTTONUP = 0x020c;
const WM_MBUTTONDOWN = 0x0207;
const WM_MBUTTONUP = 0x0208;
const XBUTTON1 = 0x0001;

export const THREAD_ID = 0;
export const HOOK_STATE_SLOTS = 1;

export type MouseButtonEvent = {
  button: string;
  action: "press" | "release";
  x?: number;
  y?: number;
  timestamp: number;
};

export type HookOutput = { kind: "button"; event: MouseButtonEvent };

const consumedButtons = new Set<string>(["side2"]);

export function createMouseHookProc(emit: (out: HookOutput) => void): HookProc {
  return (nCode, wParam, lParam) => {
    try {
      if (nCode >= 0 && lParam) {
        const event = parseMouseEvent(wParam, lParam);
        if (event) {
          emit({ kind: "button", event });
          if (consumedButtons.has(event.button)) return 1;
        }
      }
    } catch (e) {
      console.error("[orbit] Hook callback error, passing event through:", e);
    }
    return callNextHook(nCode, wParam, lParam);
  };
}

function parseMouseEvent(wParam: number, lParam: number): MouseButtonEvent | null {
  if (wParam !== WM_XBUTTONDOWN && wParam !== WM_XBUTTONUP && wParam !== WM_MBUTTONDOWN && wParam !== WM_MBUTTONUP) return null;
  const info: MouseHookInfo = readHookInfo(lParam);
  const at = { x: info.x, y: info.y, timestamp: info.time };
  if (wParam === WM_MBUTTONDOWN || wParam === WM_MBUTTONUP) {
    return { button: "middle", action: wParam === WM_MBUTTONDOWN ? "press" : "release", ...at };
  }
  const button = ((info.mouseData >> 16) & 0xffff) === XBUTTON1 ? "side1" : "side2";
  return { button, action: wParam === WM_XBUTTONDOWN ? "press" : "release", ...at };
}
