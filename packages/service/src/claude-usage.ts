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

const CACHE_TTL = 60_000; // 60 seconds
let cachedResult: ClaudeUsage | null = null;
let cachedAt = 0;

function emptyTier(): ClaudeUsageTier {
  return { used: 0, limit: 0, percent: 0 };
}

function emptyUsage(): ClaudeUsage {
  return { available: false, session: emptyTier(), weekly: emptyTier(), status: "green" };
}

function computeStatus(percent: number): "green" | "amber" | "red" {
  if (percent > 85) return "red";
  if (percent >= 60) return "amber";
  return "green";
}

/**
 * Read OAuth token from Claude Code credentials file.
 */
function readCredentials(): string | null {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    const raw = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const data = JSON.parse(raw);
    // Token can be at root level or nested under claudeAiOauth
    const oauth = data.claudeAiOauth || data;
    const token = oauth.accessToken || oauth.access_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Call the Anthropic OAuth usage API.
 */
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
        if (res.statusCode !== 200) {
          console.error(`[orbit] Claude usage API returned ${res.statusCode}: ${body.slice(0, 200)}`);
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

/**
 * Scan local JSONL transcripts for token counts.
 * Returns total input + output tokens from the most recent files.
 */
function readLocalTokens(): { inputTokens: number; outputTokens: number } {
  const result = { inputTokens: 0, outputTokens: 0 };

  try {
    if (!fs.existsSync(PROJECTS_DIR)) return result;

    // Walk project dirs to find recent .jsonl files
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
              // Only files modified in the last 24 hours
              if (Date.now() - stat.mtimeMs < 86_400_000) {
                jsonlFiles.push({ path: full, mtime: stat.mtimeMs });
              }
            } catch {}
          }
        }
      } catch {}
    }

    scanDir(PROJECTS_DIR, 0);

    // Sort by most recent, take top 5
    jsonlFiles.sort((a, b) => b.mtime - a.mtime);
    const toRead = jsonlFiles.slice(0, 5);

    for (const file of toRead) {
      try {
        // Read the tail of the file to avoid huge reads
        const stat = fs.statSync(file.path);
        const readSize = Math.min(stat.size, 256 * 1024); // 256KB tail
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
            // Claude Code JSONL records have usage.input_tokens and usage.output_tokens
            if (record.usage) {
              if (typeof record.usage.input_tokens === "number") {
                result.inputTokens += record.usage.input_tokens;
              }
              if (typeof record.usage.output_tokens === "number") {
                result.outputTokens += record.usage.output_tokens;
              }
            }
            // Also check message.usage pattern
            if (record.message?.usage) {
              if (typeof record.message.usage.input_tokens === "number") {
                result.inputTokens += record.message.usage.input_tokens;
              }
              if (typeof record.message.usage.output_tokens === "number") {
                result.outputTokens += record.message.usage.output_tokens;
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }
      } catch {}
    }
  } catch {}

  return result;
}

/**
 * Get Claude Code usage information.
 * Results are cached for 60 seconds.
 */
export async function getClaudeUsage(): Promise<ClaudeUsage> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL) {
    return cachedResult;
  }

  const token = readCredentials();
  if (!token) {
    const result = emptyUsage();
    cachedResult = result;
    cachedAt = now;
    return result;
  }

  const apiData = await fetchUsageApi(token);

  // Also gather local token counts
  const localTokens = readLocalTokens();

  let session: ClaudeUsageTier;
  let weekly: ClaudeUsageTier;

  if (apiData) {
    // API returns five_hour/seven_day with utilization (0-100)
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
    // API unavailable — provide local token data with no limit info
    const totalTokens = localTokens.inputTokens + localTokens.outputTokens;
    session = { used: totalTokens, limit: 0, percent: 0 };
    weekly = { used: totalTokens, limit: 0, percent: 0 };
  }

  // Use the higher utilization percentage for overall status
  const maxPercent = Math.max(session.percent, weekly.percent);

  const result: ClaudeUsage = {
    available: true,
    session,
    weekly,
    status: computeStatus(maxPercent),
  };

  cachedResult = result;
  cachedAt = now;
  return result;
}
