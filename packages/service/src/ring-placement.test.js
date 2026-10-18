const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const RING_SRC = path.resolve(__dirname, "..", "..", "ring", "src");
let tmp, placeRing;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-ring-placement-"));
  const out = path.join(tmp, "ring-placement.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(RING_SRC, "ring-placement.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ placeRing } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const display = { x: 1920, y: 0, width: 1280, height: 720 };

test("the ring window covers the whole display so the real pointer is seen anywhere on it", () => {
  const p = placeRing({ x: 2500, y: 300 }, display, 190);
  expect(p.window).toEqual(display);
});

test("the ring is centred on the pointer, in window coordinates, and the pointer is left alone", () => {
  const p = placeRing({ x: 2500, y: 300 }, display, 190);
  expect(p.center).toEqual({ x: 580, y: 300 });
  expect(p.warpTo).toBeNull();
});

test("near an edge the ring is pushed inside the display and the pointer is brought to its centre", () => {
  const p = placeRing({ x: 1930, y: 710 }, display, 190);
  expect(p.center).toEqual({ x: 190, y: 530 });
  expect(p.warpTo).toEqual({ x: 2110, y: 530 });
});

test("a display smaller than the ring keeps it centred", () => {
  const small = { x: 0, y: 0, width: 300, height: 200 };
  const p = placeRing({ x: 10, y: 10 }, small, 190);
  expect(p.center).toEqual({ x: 150, y: 100 });
});
