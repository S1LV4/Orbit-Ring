import { hovered } from "../state/ring-state";
import { closeRing } from "../hooks/useHostBridge";

export function Hub() {
  const isGlow = hovered.value >= 0;

  return (
    <div
      class={`cx in${isGlow ? " glow" : ""}`}
      onClick={() => closeRing()}
    >
      <svg viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </div>
  );
}
