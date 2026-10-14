<a id="readme-top"></a>

<br />
<p align="center">
  <a href="https://github.com/S1LV4/Orbit-Ring">
    <img src="./assets/orbitring-banner.webp" alt="OrbitRing" width="800">
  </a>
</p>

<div align="center">

  <p align="center">
    <b>A radial actions menu and mouse-button remapper for Windows.</b>
    <br />
    Press a thumb button, flick the mouse, and the action runs — with plugins for the tools you use.
  </p>

  <p align="center">
    <a href="https://github.com/S1LV4/Orbit-Ring/actions/workflows/build.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/S1LV4/Orbit-Ring/build.yml?branch=main&label=ci&style=flat-square"></a>
    <a href="https://github.com/S1LV4/Orbit-Ring/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/S1LV4/Orbit-Ring?style=flat-square"></a>
    <a href="https://github.com/S1LV4/Orbit-Ring/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/S1LV4/Orbit-Ring?style=flat-square"></a>
    <a href="https://github.com/S1LV4/Orbit-Ring/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/S1LV4/Orbit-Ring?style=flat-square"></a>
  </p>

  <p align="center">
    <a href="https://github.com/S1LV4/Orbit-Ring/releases">Download</a>
    ·
    <a href="https://github.com/S1LV4/Orbit-Ring/issues/new?labels=bug">Report Bug</a>
    ·
    <a href="https://github.com/S1LV4/Orbit-Ring/issues/new?labels=enhancement">Request Feature</a>
    ·
    <a href="./CONTRIBUTING.md">Contribute</a>
  </p>
</div>

<div align="center">

https://github.com/user-attachments/assets/f47aa532-bd20-42e3-8a59-df1ce7b4559a

</div>

> [!NOTE]
> OrbitRing runs on **Windows 10 and 11 (x64)** only for now. It speaks **English, Brazilian
> Portuguese and Spanish**, following the Windows language.

## What OrbitRing Is

Your mouse has buttons you never use, and you reach for the keyboard for the same ten shortcuts all
day. **OrbitRing turns a mouse button into a radial menu**: press it, the ring opens around the
cursor, move toward a group, then toward an action, and it runs. No aiming at small targets — a
direction is enough.

The same app remaps any other mouse button to a shortcut, a system action, a command or a macro,
and switches those bindings automatically depending on the app in the foreground.

## What It Does

**The ring**

- Opens at the cursor on a mouse button and closes on the next press.
- Up to **8 groups** with up to **8 actions** each — editing, navigation, windows, media, capture,
  system, AI agents, or anything a plugin provides.
- Themes (dark, light, orange, negative variants), custom accent colour, size and animation speed,
  plus optional *liquid* and *ASCII* effects.
- A visual **ring editor** in the config window: drag actions from the library, reorder groups,
  preview live. Groups beyond the visible limit are kept, marked hidden, never dropped.

**Mouse-button remapping**

- Detects connected mice and identifies a button by pressing it.
- Side buttons, DPI button and wheel tilt can trigger a **keystroke**, a **system action** (volume,
  media, brightness, screenshot, lock, virtual desktops, task view, window control…), a
  **command**, or a **macro** of key presses and delays.
- **Per-app profiles**: bindings switch on their own when the foreground app changes.

**Languages**

- The app, the ring and the tray menu follow the Windows language: English, Brazilian Portuguese
  or Spanish. Regional variants use their base language (Mexican Spanish gets Spanish); any other
  language gets English.
- Plugin texts (action names and live states) are still in Portuguese.

**Plugins**

- A plugin adds live actions and state to the ring. The catalog ships with the app and is
  **opt-in** — nothing is installed until you click *Install* in the Plugins tab.
- Installed plugins live in `~/.orbit/plugins/` and are offered updates when the catalog version
  changes.

## Plugin Catalog

| Plugin | What it puts in the ring |
| --- | --- |
| **Claude Code** | 5-hour and weekly usage across every Windows and WSL account, and approval of Claude Code permission prompts from the ring |
| **Codex** | OpenAI Codex CLI usage (5-hour session and week), Windows and WSL |
| **Gemini CLI** | Gemini CLI quota for the Pro and Flash models |
| **Antigravity** | Google Antigravity quota (Gemini and Claude/GPT, 5-hour and weekly windows) |
| **Discord Voice Control** | Mute and deafen in Discord voice |
| **PowerToys** | Color Picker, Always On Top, FancyZones, Screen Ruler, Text Extractor, Peek… |
| **Steam** | The running game, the active download and recently played games with their covers; opens library, store, friends and Big Picture |

Plugins read other tools' data **read-only**, never log or send credentials, and report a missing
tool, account or connection as a state instead of an error. Writing your own is a folder with a
`manifest.json` and plain CommonJS — see [CONTRIBUTING.md](CONTRIBUTING.md#writing-a-plugin).

## Install

Download `OrbitRing-Setup-X.Y.Z.exe` from [Releases](https://github.com/S1LV4/Orbit-Ring/releases)
and run it. OrbitRing starts in the system tray; right-click the tray icon to open the settings.

> [!WARNING]
> The installer is **not code-signed** yet, so Windows SmartScreen may warn about an unknown
> publisher. Only run an installer downloaded from the official Releases page.

## Run From Source

Requirements: Windows 10/11 x64, Node.js 24 and npm, Git.

```sh
git clone https://github.com/S1LV4/Orbit-Ring.git
cd Orbit-Ring
npm ci
npm run dev
```

`npm run dev` builds everything and starts the service, the config UI dev server and the ring with
its tray icon.

| Command | Does |
| --- | --- |
| `npm run dev` | Build and start service + config UI + ring |
| `npm run typecheck` | Type-check the four packages |
| `npm test` | Service and plugin unit tests |
| `npm run build && npm run test:system` | System test against the built service |
| `npm run test:e2e` | Ring and config UI in a browser (first time: `npx playwright install chromium`) |
| `npm run test:all` | Everything CI runs |
| `npm run dist` | Build the Windows installer into `packages/ring/release/` |

## How It's Built

An npm-workspaces monorepo:

| Package | Role |
| --- | --- |
| `packages/service` | Node service: device detection, low-level mouse hook, config store, plugin loader. Talks over WebSocket on `localhost:9119` |
| `packages/ring` | Electron app: the ring overlay (Preact), tray icon and config window |
| `packages/ui` | The config UI (React, Vite, Tailwind) |
| `packages/shared` | Types, the WebSocket protocol, the ring catalog and the translations (`locales/<language>/`) |
| `plugins/` | The opt-in plugin catalog |

Local servers bind to `127.0.0.1` only, the config window opens external links in your browser,
and plugin icons are treated as plain SVG paths, never as markup.

## Contributing

Contributions are welcome — bug reports, plugins, translations and code. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) ([adding or fixing a translation](CONTRIBUTING.md#translating)); the full development rules are in [AGENTS.md](AGENTS.md).
Changes are developed test-first, and the tests never touch your real `~/.orbit` or any outside
service.

For a security problem, please don't open a public issue — contact
[@S1LV4](https://github.com/S1LV4) first.

## License

OrbitRing is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only).
Third-party logos used to identify tools remain trademarks of their owners; see
[`packages/shared/src/BRAND-ICONS.md`](packages/shared/src/BRAND-ICONS.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
