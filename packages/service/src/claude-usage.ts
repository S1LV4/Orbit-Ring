import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ClaudeUsageTier {
  used: number;
  limit: number;
  percent: number;
  resetsAt?: number;
}

export interface ClaudeUsage {
  available: boolean;
  session: ClaudeUsageTier;
  weekly: ClaudeUsageTier;
  status: "green" | "amber" | "red";
  reason?: "no_credentials" | "unauthorized" | "api_error";
}

interface OAuthCredentials {
  accessToken?: string;
  access_token?: string;
  [key: string]: unknown;
}

interface UsageApiResponse {
  session?: {
    used?: number;
    limit?: number;
    percent?: number;
    resets_at?: number;
  };
  weekly?: {
    used?: number;
    limit?: number;
    percent?: number;
    resets_at?: number;
  };
  [key: string]: unknown;
}

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, ".claude", ".credentials.json");
const PROJECTS_DIR = path.join(HOME, ".claude", "projects");

const CACHE_TTL = 55_000;
let cachedResult: ClaudeUsage | null = null;
let cachedAt = 0;

function emptyTier(): ClaudeUsageTier {
  return { used: 0, limit: 0, percent: 0 };
}

function emptyUsage(reason: ClaudeUsage["reason"]): ClaudeUsage {
  return { available: false, session: emptyTier(), weekly: emptyTier(), status: "green", reason };
}

let lastApiStatus = 0;

function computeStatus(percent: number): "green" | "amber" | "red" {
  if (percent > 85) return "red";
  if (percent >= 60) return "amber";
  return "green";
}

function readCredentials(): string | null {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    const raw = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const data = JSON.parse(raw);
    const oauth = data.claudeAiOauth || data;
    const token = oauth.accessToken || oauth.access_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function fetchUsageApi(token: string): Promise<UsageApiResponse | null> {
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: "api.anthropic.com",
      path: "/api/oauth/usage",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "claude-code/1.0 orbitring",
        Accept: "application/json",
      },
      timeout: 10_000,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        lastApiStatus = res.statusCode ?? 0;
        if (res.statusCode !== 200) {
          console.error(`[orbit] Claude usage API returned ${res.statusCode}`);
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body) as UsageApiResponse);
        } catch {
          console.error("[orbit] Failed to parse Claude usage API response");
          resolve(null);
        }
      });
    });

    req.on("error", (err) => {
      console.error("[orbit] Claude usage API error:", err.message);
      resolve(null);
    });

    req.on("timeout", () => {
      req.destroy();
      console.error("[orbit] Claude usage API timeout");
      resolve(null);
    });

    req.end();
  });
}

function readLocalTokens(): { inputTokens: number; outputTokens: number } {
  const result = { inputTokens: 0, outputTokens: 0 };

  try {
    if (!fs.existsSync(PROJECTS_DIR)) return result;

    const jsonlFiles: { path: string; mtime: number }[] = [];

    function scanDir(dir: string, depth: number) {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full, depth + 1);
          } else if (entry.name.endsWith(".jsonl")) {
            try {
              const stat = fs.statSync(full);
              if (Date.now() - stat.mtimeMs < 86_400_000) {
                jsonlFiles.push({ path: full, mtime: stat.mtimeMs });
              }
            } catch {}
          }
        }
      } catch {}
    }

    scanDir(PROJECTS_DIR, 0);

    jsonlFiles.sort((a, b) => b.mtime - a.mtime);
    const toRead = jsonlFiles.slice(0, 5);

    for (const file of toRead) {
      try {
        const stat = fs.statSync(file.path);
        const readSize = Math.min(stat.size, 256 * 1024);
        const fd = fs.openSync(file.path, "r");
        const buffer = Buffer.alloc(readSize);
        fs.readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);

        const content = buffer.toString("utf8");
        const lines = content.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const record = JSON.parse(trimmed);
            if (record.usage) {
              if (typeof record.usage.input_tokens === "number") {
                result.inputTokens += record.usage.input_tokens;
              }
              if (typeof record.usage.output_tokens === "number") {
                result.outputTokens += record.usage.output_tokens;
              }
            }
            if (record.message?.usage) {
              if (typeof record.message.usage.input_tokens === "number") {
                result.inputTokens += record.message.usage.input_tokens;
              }
              if (typeof record.message.usage.output_tokens === "number") {
                result.outputTokens += record.message.usage.output_tokens;
              }
            }
          } catch {
          }
        }
      } catch {}
    }
  } catch {}

  return result;
}

export async function getClaudeUsage(): Promise<ClaudeUsage> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL) {
    return cachedResult;
  }

  const token = readCredentials();
  if (!token) {
    const result = emptyUsage("no_credentials");
    cachedResult = result;
    cachedAt = now;
    return result;
  }

  lastApiStatus = 0;
  const apiData = await fetchUsageApi(token);

  let session: ClaudeUsageTier;
  let weekly: ClaudeUsageTier;
  let available = true;
  let reason: ClaudeUsage["reason"];

  if (apiData) {
    const fh = (apiData as any).five_hour;
    const sd = (apiData as any).seven_day;
    session = {
      used: fh?.used_dollars ?? 0,
      limit: fh?.limit_dollars ?? 0,
      percent: fh?.utilization ?? 0,
      resetsAt: fh?.resets_at ? new Date(fh.resets_at).getTime() : undefined,
    };
    weekly = {
      used: sd?.used_dollars ?? 0,
      limit: sd?.limit_dollars ?? 0,
      percent: sd?.utilization ?? 0,
      resetsAt: sd?.resets_at ? new Date(sd.resets_at).getTime() : undefined,
    };
  } else {
    available = false;
    reason = lastApiStatus === 401 || lastApiStatus === 403 ? "unauthorized" : "api_error";
    const localTokens = readLocalTokens();
    const totalTokens = localTokens.inputTokens + localTokens.outputTokens;
    session = { used: totalTokens, limit: 0, percent: 0 };
    weekly = { used: totalTokens, limit: 0, percent: 0 };
  }

  const maxPercent = Math.max(session.percent, weekly.percent);

  const result: ClaudeUsage = {
    available,
    session,
    weekly,
    status: computeStatus(maxPercent),
    ...(reason ? { reason } : {}),
  };

  cachedResult = result;
  cachedAt = now;
  return result;
}
