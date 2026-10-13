const MAX_INPUT = 2 * 1024 * 1024;
const MAX_DEPTH = 32;

function tokenize(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\uFEFF") { i++; continue; }
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "{" || c === "}") { out.push({ t: c }); i++; continue; }
    if (c === '"') {
      let s = "";
      i++;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === "\\" && i + 1 < n) {
          const e = text[i + 1];
          s += e === "n" ? "\n" : e === "t" ? "\t" : e;
          i += 2;
          continue;
        }
        if (d === '"') { closed = true; i++; break; }
        s += d;
        i++;
      }
      if (!closed) return { tokens: out, truncated: true };
      out.push({ t: "s", v: s });
      continue;
    }
    if (c === "[") {
      while (i < n && text[i] !== "]" && text[i] !== "\n") i++;
      i++;
      continue;
    }
    let s = "";
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    out.push({ t: "s", v: s });
  }
  return { tokens: out, truncated: false };
}

function parseVdf(input) {
  if (typeof input !== "string" || !input || input.length > MAX_INPUT) return null;
  const { tokens } = tokenize(input);
  let pos = 0;
  let any = false;

  function block(depth) {
    const obj = Object.create(null);
    while (pos < tokens.length) {
      const k = tokens[pos];
      if (k.t === "}") { pos++; return obj; }
      if (k.t === "{") {
        pos++;
        if (depth < MAX_DEPTH) block(depth + 1); else return obj;
        continue;
      }
      pos++;
      const v = tokens[pos];
      if (!v) break;
      if (v.t === "s") { obj[k.v] = v.v; pos++; any = true; continue; }
      if (v.t === "{") {
        pos++;
        if (depth >= MAX_DEPTH) return obj;
        obj[k.v] = block(depth + 1);
        any = true;
        continue;
      }
    }
    return obj;
  }

  const root = block(0);
  return any ? root : null;
}

function vget(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  const lk = String(key).toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lk) return obj[k];
  return undefined;
}

module.exports = { parseVdf, vget };
