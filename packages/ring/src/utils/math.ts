/** Angle of (x, y) in radians */
export function polar(x: number, y: number): { r: number; a: number } {
  return { r: Math.hypot(x, y), a: Math.atan2(y, x) };
}

/** Shortest signed angular difference (radians) */
export function angDiff(a: number, b: number): number {
  let d = ((b - a) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return d;
}

/** Simple spring step: returns updated value */
export function spring(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}
