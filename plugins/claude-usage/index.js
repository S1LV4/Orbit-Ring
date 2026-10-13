const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, ".claude", ".credentials.json");

function readCredentials() {
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

function fetchUsage(token) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "claude-code/1.0 orbitring-plugin",
          Accept: "application/json",
        },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode !== 200) { resolve(null); return; }
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function showToast(title, message) {
  if (process.platform !== "win32") {
    console.log(`[claude-usage] ${title}: ${message}`);
    return;
  }
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${title}</text><text>${message}</text></binding></visual></toast>')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OrbitRing').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000, windowsHide: true });
}

async function getUsageData() {
  const token = readCredentials();
  if (!token) {
    return { available: false, session: { percent: 0 }, weekly: { percent: 0 }, status: "green" };
  }

  const apiData = await fetchUsage(token);
  if (!apiData) {
    return { available: false, session: { percent: 0 }, weekly: { percent: 0 }, status: "green" };
  }

  const fh = apiData.five_hour || {};
  const sd = apiData.seven_day || {};

  const session = {
    used: fh.used_dollars || 0,
    limit: fh.limit_dollars || 0,
    percent: fh.utilization || 0,
  };

  const weekly = {
    used: sd.used_dollars || 0,
    limit: sd.limit_dollars || 0,
    percent: sd.utilization || 0,
  };

  const maxPercent = Math.max(session.percent, weekly.percent);
  const status = maxPercent > 85 ? "red" : maxPercent >= 60 ? "amber" : "green";

  return { available: true, session, weekly, status };
}

// Plugin interface

module.exports = {
  onLoad() {
    console.log("[claude-usage] Plugin loaded");
  },

  onUnload() {
    console.log("[claude-usage] Plugin unloaded");
  },

  async onAction(actionId) {
    if (actionId === "show_usage") {
      const data = await getUsageData();
      if (!data.available) {
        showToast("Claude Usage", "Claude Code credentials not found");
        return;
      }
      const msg = `Session: ${data.session.percent}% | Weekly: ${data.weekly.percent}% | Status: ${data.status.toUpperCase()}`;
      showToast("Claude Usage", msg);
      return;
    }

    if (actionId === "usage_gauge") {
      return await getUsageData();
    }
  },
};
