import type { Action } from "@m-ring/shared";
import { exec } from "child_process";

/**
 * Executes actions by simulating keyboard input or running commands.
 *
 * On Windows, uses PowerShell's SendKeys or native SendInput via ffi.
 * On Linux, uses xdotool.
 * On macOS, uses osascript.
 */
export class ActionExecutor {
  private platform = process.platform;

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
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject WScript.Shell).SendKeys([char]175)\"",
        linux: "amixer set Master 5%+",
        darwin: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 5)'",
      },
      volume_down: {
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject WScript.Shell).SendKeys([char]174)\"",
        linux: "amixer set Master 5%-",
        darwin: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 5)'",
      },
      volume_mute: {
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject WScript.Shell).SendKeys([char]173)\"",
        linux: "amixer set Master toggle",
        darwin: "osascript -e 'set volume with output muted'",
      },
      media_play_pause: {
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject WScript.Shell).SendKeys([char]179)\"",
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
      show_desktop: {
        win32: "powershell -NoProfile -Command \"(New-Object -ComObject Shell.Application).ToggleDesktop()\"",
        linux: "wmctrl -k on",
        darwin: "osascript -e 'tell application \"Finder\" to set visible of every process to false'",
      },
    };

    const cmd = commands[action]?.[this.platform];
    if (cmd) {
      return this.shell(cmd);
    }
    console.warn(`[m-ring] System action "${action}" not implemented for ${this.platform}`);
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

  private shell(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 5000 }, (err) => {
        if (err) {
          console.error(`[m-ring] Command failed: ${cmd}`, err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
