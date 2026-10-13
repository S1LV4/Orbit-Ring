import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

const OUT_MAX_BYTES = 48 * 1024;
const IN_MAX_BYTES = 20 * 1024 * 1024;
const SIZE_DEFAULT = 96;
const SIZE_MIN = 32;
const SIZE_MAX = 160;
const TIME_BOX_MS = 2000;
const CONCURRENCY = 2;
const CACHE_MAX = 64;
const MAX_INPUT_PIXELS = 64_000_000;
const QUALITIES = [80, 68, 56, 44, 32];

export interface ThumbnailOptions {
  size?: number;
}

export interface ThumbnailerDeps {
  loadSharp?: () => unknown;
  timeoutMs?: number;
}

export type MakeThumbnail = (input: string | Uint8Array, opts?: ThumbnailOptions) => Promise<string | null>;

type Sharp = any;

function clampSize(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : SIZE_DEFAULT;
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, n));
}

function decodeIco(buf: Buffer): { png: Buffer } | { raw: Buffer; width: number; height: number } | null {
  if (buf.length < 22 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  if (count < 1 || count > 64 || buf.length < 6 + count * 16) return null;
  let best: { w: number; bpp: number; size: number; off: number } | null = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const w = buf[e] || 256, bpp = buf.readUInt16LE(e + 6);
    const size = buf.readUInt32LE(e + 8), off = buf.readUInt32LE(e + 12);
    if (off + size > buf.length || size < 40) continue;
    if (!best || w > best.w || (w === best.w && bpp > best.bpp)) best = { w, bpp, size, off };
  }
  if (!best) return null;
  const data = buf.subarray(best.off, best.off + best.size);
  if (data.readUInt32BE(0) === 0x89504e47) return { png: data };
  if (data.readUInt32LE(0) !== 40 || data.readUInt16LE(14) !== 32 || data.readUInt32LE(16) !== 0) return null;
  const width = data.readInt32LE(4), height = data.readInt32LE(8) / 2;
  if (width < 1 || width > 256 || height < 1 || height > 256 || !Number.isInteger(height)) return null;
  const px = 40, maskRow = Math.ceil(width / 32) * 4, mask = px + width * height * 4;
  if (data.length < mask) return null;
  const hasMask = data.length >= mask + maskRow * height;
  const raw = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const src = px + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = src + x * 4, d = (y * width + x) * 4;
      raw[d] = data[s + 2]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s]; raw[d + 3] = data[s + 3];
      if (data[s + 3]) anyAlpha = true;
    }
  }
  if (!anyAlpha) {
    for (let y = 0; y < height; y++) {
      const row = mask + (height - 1 - y) * maskRow;
      for (let x = 0; x < width; x++) {
        const transparent = hasMask && (data[row + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
        raw[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  }
  return { raw, width, height };
}

function isLocalAbsolute(p: string): boolean {
  if (!p || p.includes("\0") || !path.isAbsolute(p)) return false;
  return !/^[\\/]{2}/.test(p);
}

export function createThumbnailer(deps: ThumbnailerDeps = {}): MakeThumbnail {
  const timeoutMs = deps.timeoutMs ?? TIME_BOX_MS;
  const loadSharp = deps.loadSharp ?? (() => require("sharp"));
  let sharp: Sharp | null | undefined;
  const getSharp = (): Sharp | null => {
    if (sharp === undefined) {
      try {
        const mod = loadSharp() as any;
        sharp = typeof mod === "function" ? mod : typeof mod?.default === "function" ? mod.default : null;
      } catch {
        sharp = null;
      }
      if (!sharp) console.warn("[orbit] makeThumbnail: sharp is not available — action images are disabled");
    }
    return sharp;
  };

  const cache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string | null>>();
  let running = 0;
  const waiting: Array<() => void> = [];
  const acquire = (): Promise<void> => {
    if (running < CONCURRENCY) { running++; return Promise.resolve(); }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next(); else running--;
  };

  async function render(lib: Sharp, bytes: Buffer, isIco: boolean, size: number): Promise<string | null> {
    let source: Buffer = bytes, rawOpts: Record<string, unknown> | undefined;
    if (isIco || (bytes.length > 4 && bytes.readUInt32LE(0) === 0x00010000)) {
      const ico = decodeIco(bytes);
      if (!ico) return null;
      if ("png" in ico) source = ico.png;
      else { source = ico.raw; rawOpts = { raw: { width: ico.width, height: ico.height, channels: 4 } }; }
    }
    const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    for (let px = size; px >= SIZE_MIN; px = px === SIZE_MIN ? 0 : Math.max(SIZE_MIN, Math.floor(px * 0.75))) {
      for (const quality of QUALITIES) {
        const out: Buffer = await lib(source, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, ...rawOpts })
          .rotate()
          .resize(px, px, { fit: "cover", position: "centre" })
          .webp({ quality, effort: 4 })
          .timeout({ seconds })
          .toBuffer();
        if (out.length <= OUT_MAX_BYTES) return "data:image/webp;base64," + out.toString("base64");
      }
    }
    return null;
  }

  return async function makeThumbnail(input, opts) {
    try {
      const size = clampSize(opts && typeof opts === "object" ? opts.size : undefined);
      let key: string, read: () => Promise<Buffer>, isIco = false;
      if (typeof input === "string") {
        if (!isLocalAbsolute(input)) return null;
        const file = path.resolve(input);
        const st = await fs.promises.stat(file);
        if (!st.isFile() || st.size <= 0 || st.size > IN_MAX_BYTES) return null;
        key = `f|${file}|${st.mtimeMs}|${st.size}|${size}`;
        read = () => fs.promises.readFile(file);
        isIco = /\.ico$/i.test(file);
      } else if (input instanceof Uint8Array) {
        if (input.length <= 0 || input.length > IN_MAX_BYTES) return null;
        const buf = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
        key = `b|${createHash("sha1").update(buf).digest("hex")}|${buf.length}|${size}`;
        read = () => Promise.resolve(buf);
      } else {
        return null;
      }

      const hit = cache.get(key);
      if (hit !== undefined) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const pending = inFlight.get(key);
      if (pending) return await pending;

      const lib = getSharp();
      if (!lib) return null;

      const job = (async (): Promise<string | null> => {
        await acquire();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const work = (async () => {
            const bytes = await read();
            if (bytes.length > IN_MAX_BYTES) return null;
            return render(lib, bytes, isIco, size);
          })().catch(() => null);
          const result = await Promise.race([
            work,
            new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
          ]);
          if (result) {
            cache.set(key, result);
            if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
          }
          return result;
        } catch {
          return null;
        } finally {
          if (timer) clearTimeout(timer);
          release();
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, job);
      return await job;
    } catch {
      return null;
    }
  };
}

export const makeThumbnail: MakeThumbnail = createThumbnailer();
