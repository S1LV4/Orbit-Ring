const path = require("path");

const IDLE_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 4_000;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$in = [Console]::In
$out = [Console]::Out
$out.WriteLine('ready')
$out.Flush()
while ($true) {
  $line = $in.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Split([char]9)
  if ($p.Length -lt 2) { continue }
  $id = $p[0]
  $cmd = $p[1]
  $arg = ''
  if ($p.Length -gt 2) { $arg = $p[2] }
  $r = 'err'
  try {
    if ($cmd -ceq 'ping') {
      $r = 'ok'
    } elseif ($cmd -ceq 'has' -or $cmd -ceq 'set') {
      if ($arg -cnotmatch '^Local\\\\[A-Za-z0-9_-]{1,120}$') {
        $r = 'bad'
      } else {
        $h = $null
        try {
          $h = [System.Threading.EventWaitHandle]::OpenExisting($arg)
          if ($cmd -ceq 'set') { [void]$h.Set() }
          $r = 'ok'
        } catch [System.Threading.WaitHandleCannotBeOpenedException] {
          $r = 'missing'
        } catch [System.UnauthorizedAccessException] {
          $r = 'denied'
        } finally {
          if ($null -ne $h) { $h.Dispose() }
        }
      }
    } elseif ($cmd -ceq 'fg') {
      if (-not ('OrbitRingPT.Native' -as [type])) {
        Add-Type -Namespace OrbitRingPT -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint processId);'
      }
      $hwnd = [OrbitRingPT.Native]::GetForegroundWindow()
      $procId = [uint32]0
      [void][OrbitRingPT.Native]::GetWindowThreadProcessId($hwnd, [ref]$procId)
      $name = ''
      if ($procId -ne 0) { $name = [System.Diagnostics.Process]::GetProcessById([int]$procId).ProcessName }
      $r = 'ok' + [char]9 + $name
    }
  } catch {
    $r = 'err'
  }
  $out.WriteLine($id + [char]9 + $r)
  $out.Flush()
}
`;

function powershellPath(env) {
  const root = env && (env.SystemRoot || env.windir);
  return root ? path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
}

function helperArgs() {
  return [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
    "-EncodedCommand", Buffer.from(SCRIPT, "utf16le").toString("base64"),
  ];
}

function createHelper(deps = {}) {
  const spawn = deps.spawn || require("child_process").spawn;
  const env = deps.env || process.env;
  const setT = deps.setTimeout || setTimeout;
  const clearT = deps.clearTimeout || clearTimeout;
  const idleMs = deps.idleMs || IDLE_MS;
  const requestTimeoutMs = deps.requestTimeoutMs || REQUEST_TIMEOUT_MS;

  let child = null;
  let buffer = "";
  let seq = 0;
  let idleTimer = null;
  let starts = 0;
  const pending = new Map();

  function settle(id, fields) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearT(p.timer);
    p.resolve(fields);
  }

  function failAll(reason) {
    for (const id of Array.from(pending.keys())) settle(id, [reason]);
  }

  function onData(chunk) {
    buffer += chunk.toString("utf8");
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      const fields = line.split("\t");
      if (fields.length >= 2) settle(fields[0], fields.slice(1));
    }
  }

  function kill() {
    const c = child;
    child = null;
    buffer = "";
    if (idleTimer) { clearT(idleTimer); idleTimer = null; }
    if (c) {
      try { c.stdin.end(); } catch {}
      try { c.kill(); } catch {}
    }
    failAll("dead");
  }

  function armIdle() {
    if (idleTimer) clearT(idleTimer);
    idleTimer = setT(() => { idleTimer = null; if (pending.size === 0) kill(); else armIdle(); }, idleMs);
    if (idleTimer && idleTimer.unref) idleTimer.unref();
  }

  function ensure() {
    if (child) return true;
    let c;
    try {
      c = spawn(powershellPath(env), helperArgs(), { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      return false;
    }
    if (!c || !c.stdin || !c.stdout) return false;
    starts++;
    child = c;
    buffer = "";
    c.stdout.on("data", (d) => { if (child === c) onData(d); });
    const gone = () => {
      if (child !== c) return;
      child = null;
      if (idleTimer) { clearT(idleTimer); idleTimer = null; }
      failAll("dead");
    };
    c.on("exit", gone);
    c.on("error", gone);
    c.stdin.on("error", () => {});
    if (c.unref) c.unref();
    if (c.stdout.unref) c.stdout.unref();
    if (c.stdin.unref) c.stdin.unref();
    return true;
  }

  function request(cmd, arg, timeoutMs) {
    return new Promise((resolve) => {
      if (!ensure()) { resolve(["dead"]); return; }
      const id = String(++seq);
      const timer = setT(() => {
        if (pending.has(id)) { settle(id, ["timeout"]); kill(); }
      }, timeoutMs || requestTimeoutMs);
      if (timer && timer.unref) timer.unref();
      pending.set(id, { resolve, timer });
      armIdle();
      try {
        child.stdin.write(`${id}\t${cmd}${arg ? `\t${arg}` : ""}\n`);
      } catch {
        settle(id, ["dead"]);
        kill();
      }
    });
  }

  return {
    ping: (timeoutMs) => request("ping", "", timeoutMs),
    has: (name, timeoutMs) => request("has", name, timeoutMs),
    set: (name, timeoutMs) => request("set", name, timeoutMs),
    foreground: (timeoutMs) => request("fg", "", timeoutMs),
    stop: kill,
    isRunning: () => !!child,
    startCount: () => starts,
  };
}

module.exports = { createHelper, SCRIPT, helperArgs, powershellPath, IDLE_MS, REQUEST_TIMEOUT_MS };
