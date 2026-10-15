import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { IncomingMessage } from "http";
import { SERVICE_TOKEN_FILE, WS_SUBPROTOCOL, serviceProtocols, tokenFromProtocols } from "@orbitring/shared";

export { serviceProtocols };

export const generateServiceToken = () => crypto.randomBytes(32).toString("hex");

export function writeServiceToken(dir: string, token: string): void {
  const file = path.join(dir, SERVICE_TOKEN_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
}

function allowedOrigin(origin: string | undefined, uiPort: number): boolean {
  if (origin === undefined || origin === "file://") return true;
  return origin === `http://localhost:${uiPort}` || origin === `http://127.0.0.1:${uiPort}`;
}

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const offeredProtocols = (header: string | string[] | undefined) =>
  String(header || "").split(",").map((p) => p.trim()).filter(Boolean);

export function makeVerifyClient(token: string, uiPort: number) {
  return (info: { origin?: string; req: IncomingMessage }): boolean =>
    allowedOrigin(info.req.headers.origin, uiPort) &&
    tokenMatches(tokenFromProtocols(offeredProtocols(info.req.headers["sec-websocket-protocol"])), token);
}

export function handleProtocols(protocols: Set<string>): string | false {
  return protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false;
}
