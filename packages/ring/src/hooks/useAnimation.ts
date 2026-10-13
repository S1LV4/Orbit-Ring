import {
  visible,
  hovered,
  lineSmooth,
  lineTargets,
  anim,
  CX,
  CY,
} from "../state/ring-state";
import { BUTTON_CENTERS } from "../utils/catalog";

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animId = 0;

export function initAnimation(cv: HTMLCanvasElement) {
  canvas = cv;
  ctx = cv.getContext("2d");
  animId = requestAnimationFrame(draw);
}

export function stopAnimation() {
  if (animId) cancelAnimationFrame(animId);
  animId = 0;
}

function draw() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, 320, 320);

  if (!visible.value) {
    animId = requestAnimationFrame(draw);
    return;
  }

  // Smooth center glow
  anim.centerGlow += (anim.centerGlowTarget - anim.centerGlow) * 0.15;

  const hov = hovered.value;

  for (let i = 0; i < BUTTON_CENTERS.length; i++) {
    const t = lineTargets[i];
    const s = lineSmooth[i];
    s.str += (t.str - s.str) * 0.12;

    if (s.str < 0.01) continue;

    const bx = BUTTON_CENTERS[i].x;
    const by = BUTTON_CENTERS[i].y;

    // Control point: pull toward mouse position for fluid curve
    let mx = (CX + bx) / 2;
    let my = (CY + by) / 2;
    if (hov === i) {
      mx += (anim.mouseX - mx) * 0.3;
      my += (anim.mouseY - my) * 0.3;
    }

    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.quadraticCurveTo(mx, my, bx, by);

    const alpha = s.str * (hov === i ? 0.4 : 0.12);
    ctx.strokeStyle = `rgba(139,92,246,${alpha})`;
    ctx.lineWidth = hov === i ? 2.5 : 1.2;
    ctx.stroke();

    // Glow dot at bubble end when hovered
    if (hov === i && s.str > 0.5) {
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139,92,246,${s.str * 0.35})`;
      ctx.fill();
    }
  }

  // Center pulse
  if (anim.centerGlow > 0.01) {
    ctx.beginPath();
    ctx.arc(CX, CY, 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139,92,246,${anim.centerGlow * 0.2})`;
    ctx.fill();
  }

  animId = requestAnimationFrame(draw);
}
