type Dpapi = { protect: (data: Buffer) => Buffer | null; unprotect: (data: Buffer) => Buffer | null };

const ENTROPY = Buffer.from("OrbitRing secret v1");
const CRYPTPROTECT_UI_FORBIDDEN = 0x1;

let dpapi: Dpapi | null | undefined;

function loadDpapi(): Dpapi | null {
  if (dpapi !== undefined) return dpapi;
  try {
    const koffi = require("koffi");
    const crypt32 = koffi.load("crypt32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const blob = koffi.pointer(koffi.struct({ cbData: "uint32", pbData: "void *" }));
    const args = [blob, "void *", blob, "void *", "void *", "uint32", koffi.out(blob)];
    const protect = crypt32.func("__stdcall", "CryptProtectData", "bool", args);
    const unprotect = crypt32.func("__stdcall", "CryptUnprotectData", "bool", args);
    const localFree = kernel32.func("void * __stdcall LocalFree(void *mem)");
    const run = (fn: (...args: unknown[]) => boolean) => (input: Buffer): Buffer | null => {
      const out: { cbData?: number; pbData?: unknown } = {};
      const entropy = { cbData: ENTROPY.length, pbData: ENTROPY };
      if (!fn({ cbData: input.length, pbData: input }, null, entropy, null, null, CRYPTPROTECT_UI_FORBIDDEN, out)) return null;
      try {
        return Buffer.from(koffi.decode(out.pbData, koffi.array("uint8", out.cbData)));
      } finally {
        localFree(out.pbData);
      }
    };
    dpapi = { protect: run(protect), unprotect: run(unprotect) };
  } catch {
    dpapi = null;
  }
  return dpapi;
}

export function secretProtection(platform: string = process.platform) {
  const api = () => (platform === "win32" ? loadDpapi() : null);
  return {
    protectSecret(secret: unknown): string | null {
      const d = api();
      if (!d || typeof secret !== "string") return null;
      return d.protect(Buffer.from(secret, "utf8"))?.toString("base64") ?? null;
    },
    unprotectSecret(blob: unknown): string | null {
      const d = api();
      if (!d || typeof blob !== "string" || !blob) return null;
      return d.unprotect(Buffer.from(blob, "base64"))?.toString("utf8") ?? null;
    },
  };
}

export const { protectSecret, unprotectSecret } = secretProtection();
