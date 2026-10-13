import type { Action } from "@m-ring/shared";
import { exec } from "child_process";
import { getClaudeUsage } from "./claude-usage";
import type { PluginLoader } from "./plugin-loader";

/**
 * Executes actions by simulating keyboard input or running commands.
 *
 * On Windows, uses PowerShell's SendKeys or native SendInput via ffi.
 * On Linux, uses xdotool.
 * On macOS, uses osascript.
 */
export class ActionExecutor {
  private platform = process.platform;
  private pluginLoader: PluginLoader | null;
  private onPluginStateChange: (() => void) | null = null;

  constructor(pluginLoader?: PluginLoader) {
    this.pluginLoader = pluginLoader ?? null;
  }

  setPluginStateCallback(cb: () => void) {
    this.onPluginStateChange = cb;
  }

  async execute(action: Action): Promise<void> {
    switch (action.type) {
      case "keystroke":
        await this.sendKeystroke(action.key, action.modifiers);
        break;
      case "system":
        await this.executeSystem(action.action);
        break;
      case "command":
        await this.runCommand(action.command, action.args);
        break;
      case "macro":
        await this.playMacro(action.steps);
        break;
      case "none":
        break;
    }
  }

  private async sendKeystroke(
    key: string,
    modifiers: ("ctrl" | "shift" | "alt" | "meta")[]
  ): Promise<void> {
    if (this.platform === "win32") {
      // Use PowerShell SendKeys for now — will switch to native SendInput later
      const psKey = this.toPowerShellKey(key, modifiers);
      return this.shell(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKey}')"`
      );
    }

    if (this.platform === "linux") {
      const parts: string[] = [];
      for (const mod of modifiers) parts.push(mod);
      parts.push(key);
      return this.shell(`xdotool key ${parts.join("+")}`);
    }

    if (this.platform === "darwin") {
      const mods = modifiers
        .map((m) => {
          if (m === "ctrl") return "control down";
          if (m === "alt") return "option down";
          if (m === "meta") return "command down";
          return "shift down";
        })
        .join(", ");
      const using = mods ? ` using {${mods}}` : "";
      return this.shell(
        `osascript -e 'tell application "System Events" to keystroke "${key}"${using}'`
      );
    }
  }

  private async executeSystem(action: string): Promise<void> {
    const commands: Record<string, Record<string, string>> = {
      volume_up: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xAF,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xAF,0,2,[UIntPtr]::Zero)"`,
        linux: "amixer set Master 5%+",
        darwin: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 5)'",
      },
      volume_down: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xAE,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xAE,0,2,[UIntPtr]::Zero)"`,
        linux: "amixer set Master 5%-",
        darwin: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 5)'",
      },
      volume_mute: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xAD,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xAD,0,2,[UIntPtr]::Zero)"`,
        linux: "amixer set Master toggle",
        darwin: "osascript -e 'set volume with output muted'",
      },
      media_play_pause: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xB3,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xB3,0,2,[UIntPtr]::Zero)"`,
        linux: "dbus-send --print-reply --dest=org.mpris.MediaPlayer2.playerctld /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.PlayPause",
      },
      screenshot: {
        win32: "snippingtool",
        linux: "gnome-screenshot -a",
        darwin: "screencapture -i ~/Desktop/screenshot.png",
      },
      open_terminal: {
        win32: "wt",
        linux: "x-terminal-emulator",
        darwin: "open -a Terminal",
      },
      open_file_manager: {
        win32: "cmd /c start explorer.exe",
        linux: "xdg-open ~",
        darwin: "open ~",
      },
      lock_screen: {
        win32: "rundll32.exe user32.dll,LockWorkStation",
        linux: "loginctl lock-session",
        darwin: "pmset displaysleepnow",
      },
      media_next: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xB0,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xB0,0,2,[UIntPtr]::Zero)"`,
        linux: "dbus-send --print-reply --dest=org.mpris.MediaPlayer2.playerctld /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Next",
      },
      media_prev: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0xB1,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0xB1,0,2,[UIntPtr]::Zero)"`,
        linux: "dbus-send --print-reply --dest=org.mpris.MediaPlayer2.playerctld /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Previous",
      },
      maximize_window: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x26,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x26,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"`,
      },
      minimize_window: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x28,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x28,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"`,
      },
      close_window: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x73,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x73,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero)"`,
      },
      switch_desktop_left: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x25,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x25,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"`,
      },
      switch_desktop_right: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x27,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x27,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"`,
      },
      task_view: {
        win32: `powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);' -Name W -Namespace K; [K.W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x09,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x09,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"`,
      },
      show_desktop: {
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject Shell.Application).ToggleDesktop()\"",
        linux: "wmctrl -k on",
        darwin: "osascript -e 'tell application \"Finder\" to set visible of every process to false'",
      },
      // Discord shortcuts are in-app only — must focus Discord window first, send keystroke, then restore focus
      discord_mute: {
        win32: this.discordKeystrokeCmd(0x4D), // Ctrl+Shift+M
      },
      discord_deafen: {
        win32: this.discordKeystrokeCmd(0x44), // Ctrl+Shift+D
      },
      discord_screen: {
        win32: this.discordKeystrokeCmd(0x53), // Ctrl+Shift+S
      },
    };

    // Plugin actions — format: "plugin:<pluginId>:<actionId>"
    if (action.startsWith("plugin:") && this.pluginLoader) {
      const parts = action.slice("plugin:".length).split(":");
      if (parts.length >= 2) {
        const [pluginId, actionId] = parts;
        console.log(`[orbit] Executing plugin action: ${pluginId} → ${actionId}`);
        return this.pluginLoader.executePluginAction(pluginId, actionId).then((result) => {
          console.log(`[orbit] Plugin action result:`, result);
          // Notify state change after small delay (let plugin update its state)
          setTimeout(() => { if (this.onPluginStateChange) this.onPluginStateChange(); }, 100);
        }).catch(e => console.error(`[orbit] Plugin action error:`, e));
      }
      console.warn(`[orbit] Invalid plugin action format: ${action}`);
      return;
    }

    // Agent actions
    if (action.startsWith("open_agent:")) {
      const agentId = action.slice("open_agent:".length);
      return this.openAgent(agentId);
    }
    if (action === "agent_approve") {
      // Send Enter to the focused terminal (approve pending agent action)
      return this.shell(this.platform === "win32"
        ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
        : `xdotool key Return`);
    }
    if (action === "agent_decline") {
      // Send Escape to decline/cancel
      return this.shell(this.platform === "win32"
        ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ESC}')"`
        : `xdotool key Escape`);
    }
    if (action === "agent_status") {
      return this.showAgentStatus();
    }

    const cmd = commands[action]?.[this.platform];
    if (cmd) {
      return this.shell(cmd);
    }
    console.warn(`[orbit] System action "${action}" not implemented for ${this.platform}`);
  }

  private async runCommand(command: string, args?: string[]): Promise<void> {
    const full = args ? `${command} ${args.join(" ")}` : command;
    return this.shell(full);
  }

  private async playMacro(steps: { type: string; key?: string; modifiers?: string[]; duration?: number }[]): Promise<void> {
    for (const step of steps) {
      if (step.type === "delay" && step.duration) {
        await new Promise((r) => setTimeout(r, step.duration));
      } else if (step.type === "key_down" && step.key) {
        await this.sendKeystroke(step.key, (step.modifiers as any) || []);
      }
    }
  }

  private toPowerShellKey(key: string, modifiers: string[]): string {
    let ps = "";
    if (modifiers.includes("ctrl")) ps += "^";
    if (modifiers.includes("alt")) ps += "%";
    if (modifiers.includes("shift")) ps += "+";
    // Map common key names
    const keyMap: Record<string, string> = {
      Enter: "{ENTER}",
      Tab: "{TAB}",
      Escape: "{ESC}",
      Backspace: "{BACKSPACE}",
      Delete: "{DELETE}",
      Home: "{HOME}",
      End: "{END}",
      PageUp: "{PGUP}",
      PageDown: "{PGDN}",
      ArrowUp: "{UP}",
      ArrowDown: "{DOWN}",
      ArrowLeft: "{LEFT}",
      ArrowRight: "{RIGHT}",
      F1: "{F1}", F2: "{F2}", F3: "{F3}", F4: "{F4}",
      F5: "{F5}", F6: "{F6}", F7: "{F7}", F8: "{F8}",
      F9: "{F9}", F10: "{F10}", F11: "{F11}", F12: "{F12}",
    };
    ps += keyMap[key] || key.toLowerCase();
    return ps;
  }

  private discordKeystrokeCmd(vk: number): string {
    // Find Discord window, save current foreground window, focus Discord,
    // send Ctrl+Shift+<key>, then restore original foreground window.
    // Uses -EncodedCommand to avoid all cmd.exe/PowerShell escaping issues.
    const vkHex = "0x" + vk.toString(16).toUpperCase();
    const script = `
Add-Type -MemberDefinition @'
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);
'@ -Name W -Namespace K
$prev = [K.W]::GetForegroundWindow()
$disc = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
if ($disc) {
  [K.W]::SetForegroundWindow($disc.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 150
  [K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x10,0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(${vkHex},0,0,[UIntPtr]::Zero)
  [K.W]::keybd_event(${vkHex},0,2,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x10,0,2,[UIntPtr]::Zero)
  [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [K.W]::SetForegroundWindow($prev) | Out-Null
} else {
  Write-Warning 'Discord not found'
}`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return `powershell -NoProfile -EncodedCommand ${encoded}`;
  }

  private async showAgentStatus(): Promise<void> {
    try {
      const usage = await getClaudeUsage();
      let lines = ["OrbitRing Agent Status", ""];
      if (usage.available) {
        lines.push("Claude Code: " + usage.status.toUpperCase());
        lines.push("Session (5h): " + usage.session.percent + "%");
        lines.push("Weekly: " + usage.weekly.percent + "%");
      } else {
        lines.push("Claude Code: not configured");
      }
      const msg = lines.join("\\n");
      if (this.platform === "win32") {
        return this.shell(`powershell -NoProfile -Command "[System.Windows.Forms.MessageBox]::Show('${msg}','OrbitRing Agent Status','OK','Information')" && exit`, true);
      }
    } catch (e) {
      console.error("[orbit] Agent status error:", e);
    }
  }

  private async openAgent(agentId: string): Promise<void> {
    const agentCommands: Record<string, Record<string, string>> = {
      "claude-code": { win32: "cmd /c start \"\" wt -w 0 claude", linux: "x-terminal-emulator -e claude" },
      "codex":       { win32: "cmd /c start \"\" wt -w 0 codex", linux: "x-terminal-emulator -e codex" },
      "cursor":      { win32: "cmd /c start \"\" cursor://", linux: "cursor" },
      "gemini-cli":  { win32: "cmd /c start \"\" wt -w 0 gemini", linux: "x-terminal-emulator -e gemini" },
      "copilot":     { win32: "cmd /c start \"\" code", linux: "code" },
      "grok":        { win32: "cmd /c start \"\" wt -w 0 grok", linux: "x-terminal-emulator -e grok" },
    };
    const cmd = agentCommands[agentId]?.[this.platform];
    if (cmd) {
      console.log(`[orbit] Opening agent: ${agentId}`);
      return this.shell(cmd, true);
    }
    console.warn(`[orbit] No launch command for agent "${agentId}" on ${this.platform}`);
  }

  private shell(cmd: string, show = false): Promise<void> {
    return new Promise((resolve) => {
      exec(cmd, { timeout: 10000, windowsHide: !show }, (err) => {
        if (err) {
          console.warn(`[orbit] Command: ${cmd.slice(0, 60)}... exit: ${err.code || err.message}`);
        }
        resolve();
      });
    });
  }
}
