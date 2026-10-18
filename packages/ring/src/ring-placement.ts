export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type RingPlacement = { window: Rect; center: Point; warpTo: Point | null };

export function placeRing(cursor: Point, display: Rect, radius: number): RingPlacement {
  const fit = (pos: number, start: number, length: number) => {
    const reach = Math.min(radius, Math.floor(length / 2));
    return Math.round(Math.max(start + reach, Math.min(pos, start + length - reach)));
  };
  const x = fit(cursor.x, display.x, display.width);
  const y = fit(cursor.y, display.y, display.height);
  const moved = x !== Math.round(cursor.x) || y !== Math.round(cursor.y);
  return {
    window: { ...display },
    center: { x: x - display.x, y: y - display.y },
    warpTo: moved ? { x, y } : null,
  };
}
