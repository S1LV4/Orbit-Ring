const fs = require("fs");
const os = require("os");
const path = require("path");

let sharp = null;
try { sharp = require("sharp"); } catch { sharp = null; }
const withSharp = sharp ? test : test.skip;
if (!sharp) console.warn("[thumbnail.test] sharp is not available here: image tests are skipped");

const LIMIT = 48 * 1024;
let tmp, mod, warnSpy;

function load() {
  const src = fs.readFileSync(path.join(__dirname, "thumbnail.ts"), "utf8");
  const { code } = require("esbuild").transformSync(src, { loader: "ts", format: "cjs", target: "node18" });
  const out = path.join(tmp, "thumbnail.compiled.js");
  fs.writeFileSync(out, code);
  return require(out);
}

function countingSharp() {
  const fn = (...args) => { fn.calls++; return sharp(...args); };
  fn.calls = 0;
  return fn;
}

const decode = (uri) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
async function expectThumb(uri, size) {
  expect(typeof uri).toBe("string");
  expect(uri).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/);
  const buf = decode(uri);
  expect(buf.length).toBeLessThanOrEqual(LIMIT);
  const meta = await sharp(buf).metadata();
  expect(meta.format).toBe("webp");
  expect([meta.width, meta.height]).toEqual([size, size]);
  return buf;
}

async function picture(file, width, height, format = "png") {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (y < height / 3) { raw[i + 1] = 200; continue; }
      if (x < width / 2) raw[i] = 220; else raw[i + 2] = 220;
    }
  }
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  img = format === "jpg" ? img.jpeg({ quality: 90 }) : format === "webp" ? img.webp() : img.png();
  await img.toFile(file);
  return file;
}

function bmpIco(size, [r, g, b]) {
  const px = size * size * 4, maskRow = Math.ceil(size / 32) * 4, dib = 40 + px + maskRow * size;
  const buf = Buffer.alloc(22 + dib);
  buf.writeUInt16LE(1, 2); buf.writeUInt16LE(1, 4);
  buf[6] = size; buf[7] = size; buf.writeUInt16LE(1, 10); buf.writeUInt16LE(32, 12);
  buf.writeUInt32LE(dib, 14); buf.writeUInt32LE(22, 18);
  const d = 22;
  buf.writeUInt32LE(40, d); buf.writeInt32LE(size, d + 4); buf.writeInt32LE(size * 2, d + 8);
  buf.writeUInt16LE(1, d + 12); buf.writeUInt16LE(32, d + 14);
  for (let i = 0; i < size * size; i++) {
    const o = d + 40 + i * 4;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; buf[o + 3] = 255;
  }
  return buf;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-thumb-test-"));
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.resetModules();
  mod = load();
});

afterEach(() => {
  warnSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("makeThumbnail — saída", () => {
  withSharp("retrato (capa 300×450) vira WebP quadrado 96×96, dentro de 48 KB, corte central", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const uri = await mk(await picture(path.join(tmp, "cover.jpg"), 300, 450, "jpg"));
    const buf = await expectThumb(uri, 96);
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => Array.from(data.subarray((y * 96 + x) * 3, (y * 96 + x) * 3 + 3));
    const [r1, g1, b1] = at(20, 70), [r2, g2, b2] = at(76, 70), [r3, g3] = at(48, 8);
    expect(r1).toBeGreaterThan(150); expect(b1).toBeLessThan(80); expect(g1).toBeLessThan(80);
    expect(b2).toBeGreaterThan(150); expect(r2).toBeLessThan(80); expect(g2).toBeLessThan(80);
    expect(g3).toBeGreaterThan(130); expect(r3).toBeLessThan(80);
  });

  withSharp("paisagem (header 460×215) também sai quadrado, mantendo o centro", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const buf = await expectThumb(await mk(await picture(path.join(tmp, "header.png"), 460, 215)), 96);
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => Array.from(data.subarray((y * 96 + x) * 3, (y * 96 + x) * 3 + 3));
    expect(at(10, 80)[0]).toBeGreaterThan(150);
    expect(at(86, 80)[2]).toBeGreaterThan(150);
  });

  withSharp("webp de entrada e Buffer de entrada funcionam", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const file = await picture(path.join(tmp, "in.webp"), 200, 120, "webp");
    await expectThumb(await mk(file), 96);
    await expectThumb(await mk(fs.readFileSync(file)), 96);
    await expectThumb(await mk(new Uint8Array(fs.readFileSync(file))), 96);
  });

  withSharp("size: padrão 96, limitado a 32..160, valores estranhos caem no padrão", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const file = await picture(path.join(tmp, "a.png"), 400, 400);
    await expectThumb(await mk(file), 96);
    await expectThumb(await mk(file, { size: 64 }), 64);
    await expectThumb(await mk(file, { size: 8 }), 32);
    await expectThumb(await mk(file, { size: 4000 }), 160);
    await expectThumb(await mk(file, { size: 63.6 }), 64);
    await expectThumb(await mk(file, { size: "big" }), 96);
    await expectThumb(await mk(file, { size: NaN }), 96);
    await expectThumb(await mk(file, null), 96);
  });

  withSharp("imagem ruidosa em 160 px continua dentro de 48 KB (baixa qualidade/tamanho até caber)", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const w = 640, h = 640, raw = Buffer.alloc(w * h * 3);
    let s = 12345;
    for (let i = 0; i < raw.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; raw[i] = s >> 16; }
    const file = path.join(tmp, "noise.png");
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
    const uri = await mk(file, { size: 160 });
    expect(typeof uri).toBe("string");
    const buf = decode(uri);
    expect(buf.length).toBeLessThanOrEqual(LIMIT);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.width).toBeGreaterThanOrEqual(32);
    expect(meta.width).toBeLessThanOrEqual(160);
  });

  withSharp(".ico: entrada PNG e entrada BMP de 32 bits são lidas (o libvips não lê ICO sozinho)", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const pngEntry = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 1 } } }).png().toBuffer();
    const head = Buffer.alloc(22);
    head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); head[6] = 64; head[7] = 64;
    head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(pngEntry.length, 14); head.writeUInt32LE(22, 18);
    const icoPng = path.join(tmp, "png.ico");
    fs.writeFileSync(icoPng, Buffer.concat([head, pngEntry]));
    let buf = await expectThumb(await mk(icoPng), 96);
    let px = (await sharp(buf).removeAlpha().raw().toBuffer()).subarray(0, 3);
    expect(px[1]).toBeGreaterThan(150); expect(px[0]).toBeLessThan(60);

    const icoBmp = path.join(tmp, "bmp.ico");
    fs.writeFileSync(icoBmp, bmpIco(32, [230, 20, 20]));
    buf = await expectThumb(await mk(icoBmp, { size: 48 }), 48);
    px = (await sharp(buf).removeAlpha().raw().toBuffer()).subarray(0, 3);
    expect(px[0]).toBeGreaterThan(180); expect(px[2]).toBeLessThan(70);

    const bad = path.join(tmp, "bad.ico");
    fs.writeFileSync(bad, Buffer.from("definitely not an icon file, just text bytes"));
    expect(await mk(bad)).toBeNull();
  });
});

describe("makeThumbnail — falhas viram null, nunca exceção", () => {
  withSharp("arquivo ausente, pasta, caminho relativo, UNC, tipos errados", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    await expect(mk(path.join(tmp, "nope.png"))).resolves.toBeNull();
    await expect(mk(tmp)).resolves.toBeNull();
    await expect(mk("relative/cover.png")).resolves.toBeNull();
    await expect(mk("\\\\server\\share\\cover.png")).resolves.toBeNull();
    await expect(mk("//server/share/cover.png")).resolves.toBeNull();
    await expect(mk("https://example.com/cover.png")).resolves.toBeNull();
    await expect(mk("")).resolves.toBeNull();
    await expect(mk(undefined)).resolves.toBeNull();
    await expect(mk(null)).resolves.toBeNull();
    await expect(mk(42)).resolves.toBeNull();
    await expect(mk({ path: "x" })).resolves.toBeNull();
    await expect(mk(Buffer.alloc(0))).resolves.toBeNull();
  });

  withSharp("bytes que não são imagem (arquivo e Buffer) e arquivo vazio", async () => {
    const mk = mod.createThumbnailer({ loadSharp: () => sharp });
    const junk = path.join(tmp, "junk.png");
    fs.writeFileSync(junk, Buffer.from("this is not a png at all ".repeat(50)));
    await expect(mk(junk)).resolves.toBeNull();
    await expect(mk(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).resolves.toBeNull();
    const empty = path.join(tmp, "empty.jpg");
    fs.writeFileSync(empty, "");
    await expect(mk(empty)).resolves.toBeNull();
    const real = fs.readFileSync(await picture(path.join(tmp, "real.png"), 300, 300));
    await expect(mk(real.subarray(0, 40))).resolves.toBeNull();
  });

  withSharp("entrada acima de 20 MB é recusada sem ser lida", async () => {
    const lib = countingSharp();
    const mk = mod.createThumbnailer({ loadSharp: () => lib });
    const big = path.join(tmp, "big.png");
    const fd = fs.openSync(big, "w");
    fs.ftruncateSync(fd, 20 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    await expect(mk(big)).resolves.toBeNull();
    await expect(mk(Buffer.alloc(20 * 1024 * 1024 + 1))).resolves.toBeNull();
    expect(lib.calls).toBe(0);
  });

  test("sharp indisponível (require falha): null, um único aviso, e não tenta de novo", async () => {
    const loadSharp = jest.fn(() => { throw new Error("Cannot find module 'sharp'"); });
    const mk = mod.createThumbnailer({ loadSharp });
    const file = path.join(tmp, "a.png");
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    await expect(mk(file)).resolves.toBeNull();
    await expect(mk(file, { size: 64 })).resolves.toBeNull();
    await expect(mk(Buffer.from([1, 2, 3]))).resolves.toBeNull();
    expect(loadSharp).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes("sharp is not available"))).toHaveLength(1);
  });

  test("sharp que não é função, ou que explode ao processar: null", async () => {
    const file = path.join(tmp, "a.png");
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    await expect(mod.createThumbnailer({ loadSharp: () => ({}) })(file)).resolves.toBeNull();
    await expect(mod.createThumbnailer({ loadSharp: () => () => { throw new Error("native crash"); } })(file)).resolves.toBeNull();
  });

  test("caixa de tempo: um processamento que não termina resolve null", async () => {
    const never = () => {
      const chain = { rotate: () => chain, resize: () => chain, webp: () => chain, timeout: () => chain, toBuffer: () => new Promise(() => {}) };
      return chain;
    };
    const mk = mod.createThumbnailer({ loadSharp: () => never, timeoutMs: 60 });
    const t0 = Date.now();
    await expect(mk(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  test("a instância padrão exportada nunca rejeita", async () => {
    await expect(mod.makeThumbnail(path.join(tmp, "missing.png"))).resolves.toBeNull();
    await expect(mod.makeThumbnail(123)).resolves.toBeNull();
  });
});

describe("makeThumbnail — cache e fila", () => {
  withSharp("mesmo caminho + mtime + tamanho + opções: segunda chamada não reprocessa", async () => {
    const lib = countingSharp();
    const mk = mod.createThumbnailer({ loadSharp: () => lib });
    const file = await picture(path.join(tmp, "a.png"), 300, 450);
    const first = await mk(file);
    const calls = lib.calls;
    expect(calls).toBeGreaterThan(0);
    expect(await mk(file)).toBe(first);
    expect(await mk(file, { size: 96 })).toBe(first);
    expect(lib.calls).toBe(calls);
    const other = await mk(file, { size: 64 });
    expect(other).not.toBe(first);
    expect(lib.calls).toBeGreaterThan(calls);
  });

  withSharp("arquivo alterado (mtime/tamanho) invalida a entrada", async () => {
    const lib = countingSharp();
    const mk = mod.createThumbnailer({ loadSharp: () => lib });
    const file = await picture(path.join(tmp, "a.png"), 200, 200);
    const first = await mk(file);
    await sharp({ create: { width: 210, height: 180, channels: 3, background: "#00ff00" } }).png().toFile(file);
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const calls = lib.calls;
    const second = await mk(file);
    expect(lib.calls).toBeGreaterThan(calls);
    expect(second).not.toBe(first);
  });

  withSharp("Buffers iguais compartilham a entrada; chamadas simultâneas iguais são uma só", async () => {
    const lib = countingSharp();
    const mk = mod.createThumbnailer({ loadSharp: () => lib });
    const bytes = fs.readFileSync(await picture(path.join(tmp, "a.png"), 256, 256));
    const [a, b, c] = await Promise.all([mk(bytes), mk(Buffer.from(bytes)), mk(bytes)]);
    expect(a).toBe(b); expect(b).toBe(c);
    expect(lib.calls).toBe(1);
  });

  withSharp("no máximo 2 processamentos ao mesmo tempo", async () => {
    let active = 0, peak = 0;
    const slow = (...args) => {
      const real = sharp(...args), toBuffer = real.toBuffer.bind(real);
      real.toBuffer = async () => {
        active++; peak = Math.max(peak, active);
        try { await new Promise((r) => setTimeout(r, 25)); return await toBuffer(); } finally { active--; }
      };
      return real;
    };
    const mk = mod.createThumbnailer({ loadSharp: () => slow });
    const files = [];
    for (let i = 0; i < 7; i++) files.push(await picture(path.join(tmp, `f${i}.png`), 100 + i * 10, 140));
    const out = await Promise.all(files.map((f) => mk(f)));
    expect(out.every((u) => typeof u === "string")).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
  });

  withSharp("LRU pequeno: depois de muitas entradas a mais antiga é reprocessada", async () => {
    const lib = countingSharp();
    const mk = mod.createThumbnailer({ loadSharp: () => lib });
    const first = await picture(path.join(tmp, "first.png"), 40, 40);
    await mk(first);
    for (let i = 0; i < 64; i++) await mk(Buffer.concat([fs.readFileSync(first), Buffer.from([i])]));
    const calls = lib.calls;
    await mk(first);
    expect(lib.calls).toBe(calls + 1);
  });
});
