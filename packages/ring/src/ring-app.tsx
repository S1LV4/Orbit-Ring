import { render } from "preact";
import { useRef, useEffect } from "preact/hooks";
import {
  visible,
  hovered,
  lineSmooth,
  lineTargets,
  anim,
  HOVER_RADIUS,
  LINE_FADE_RADIUS,
} from "./state/ring-state";
import { BUTTON_CENTERS } from "./utils/catalog";
import { ActionButton, ActionLabel } from "./components/ActionButton";
import { Hub } from "./components/Hub";
import { initAnimation } from "./hooks/useAnimation";
import { initHostBridge } from "./hooks/useHostBridge";

function showRing() {
  visible.value = true;
  // Reset smooth values
  for (let i = 0; i < lineSmooth.length; i++) lineSmooth[i].str = 0;
  anim.centerGlow = 0;
  hovered.value = -1;
}

function hideRing() {
  visible.value = false;
  anim.centerGlowTarget = 0;
  hovered.value = -1;
}

function RingApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      initAnimation(canvasRef.current);
    }
    initHostBridge(showRing, hideRing);
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const mx = e.clientX;
      const my = e.clientY;
      anim.mouseX = mx;
      anim.mouseY = my;

      // Find closest button within hover radius
      let ci = -1;
      let cd = 999;
      for (let i = 0; i < BUTTON_CENTERS.length; i++) {
        const d = Math.hypot(mx - BUTTON_CENTERS[i].x, my - BUTTON_CENTERS[i].y);
        if (d < HOVER_RADIUS && d < cd) {
          ci = i;
          cd = d;
        }
      }

      if (ci !== hovered.value) {
        hovered.value = ci;
        anim.centerGlowTarget = ci >= 0 ? 1 : 0;
      }

      // Update line targets
      for (let i = 0; i < BUTTON_CENTERS.length; i++) {
        const d = Math.hypot(mx - BUTTON_CENTERS[i].x, my - BUTTON_CENTERS[i].y);
        lineTargets[i].str =
          i === ci ? 1 : Math.max(0, 1 - d / LINE_FADE_RADIUS) * 0.15;
      }
    }

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const isVisible = visible.value;

  return (
    <>
      <canvas ref={canvasRef} id="cv" width={320} height={320} />
      {isVisible && (
        <>
          <Hub />
          {BUTTON_CENTERS.map((_, i) => (
            <ActionButton key={i} index={i} />
          ))}
          {BUTTON_CENTERS.map((_, i) => (
            <ActionLabel key={i} index={i} />
          ))}
        </>
      )}
    </>
  );
}

render(<RingApp />, document.getElementById("stage")!);
