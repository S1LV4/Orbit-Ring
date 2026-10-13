import { visible, hovered } from "../state/ring-state";
import { DEFAULT_ACTIONS } from "../utils/catalog";

declare global {
  interface Window {
    ring?: {
      executeAction: (action: any) => void;
      close: () => void;
      onShow?: (cb: () => void) => void;
      onHide?: (cb: () => void) => void;
      onRelease?: (cb: () => void) => void;
    };
  }
}

export function initHostBridge(showRing: () => void, hideRing: () => void) {
  try {
    if (window.ring) {
      window.ring.onShow?.(() => showRing());
      window.ring.onHide?.(() => hideRing());
      window.ring.onRelease?.(() => {
        if (hovered.value >= 0) {
          try {
            window.ring!.executeAction(DEFAULT_ACTIONS[hovered.value]);
          } catch {}
        } else {
          try {
            window.ring!.close();
          } catch {}
        }
      });
    } else {
      // Browser preview mode: show ring immediately
      showRing();
    }
  } catch {
    // Fallback: show ring immediately
    showRing();
  }
}

export function executeAction(index: number) {
  try {
    window.ring?.executeAction(DEFAULT_ACTIONS[index]);
  } catch {}
}

export function closeRing() {
  try {
    window.ring?.close();
  } catch {}
}
