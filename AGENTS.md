# OrbitRing — rules for agents and developers

This file is the single source of development rules for this repository. `CLAUDE.md` only points
here. Human contributors: start with [CONTRIBUTING.md](CONTRIBUTING.md); the rules below apply to
you too.

OrbitRing is a radial actions menu and mouse-button remapper for Windows, with a plugin system.
Licence: GPL-3.0-only. Repository: https://github.com/S1LV4/Orbit-Ring

## Map

npm workspaces, scope `@orbitring/*`:

| Path | What it is |
| --- | --- |
| `packages/shared` | Types, the WebSocket protocol (`protocol.ts`) and the ring catalog shared by everything |
| `packages/service` | Node service: devices, mouse hook, config store, plugin loader and catalog. WebSocket on `ws://localhost:9119` |
| `packages/ring` | Electron app: the ring overlay (Preact, bundled with esbuild), tray, config window. `electron-builder` config lives in its `package.json` |
| `packages/ui` | Config UI (React + Vite + Tailwind), shown in the config window |
| `plugins/` | The plugin **catalog** shipped with the app (one folder per plugin) |
| `scripts/system-test.cjs` | System test that boots the built service |
| `.github/workflows/build.yml` | CI: tests → installer → GitHub Release on a `v*` tag |

Generated, never edited by hand: `packages/ring/main.js`, `packages/ring/preload.js` (from
`src/main.ts`, `src/preload.ts`), `packages/ring/src/ring-bundle.js`, every `dist/`, and
`packages/ring/release/`.

## Commands

Run from the repository root.

| Command | Does |
| --- | --- |
| `npm run dev` | Builds and starts service + UI dev server + ring (same as `node start.js`) |
| `npm run typecheck` | `tsc --noEmit` on the four packages |
| `npm test` | Service unit tests (jest), including every plugin suite |
| `npm run test:plugins` | Only the plugin compatibility suite |
| `npm run build` | Builds the four packages |
| `npm run test:system` | System test (needs `npm run build` first) |
| `npm run test:e2e` | Playwright: ring, then config UI |
| `npm run test:all` | Everything CI runs, in CI order |
| `npm run dist` | Build + Windows installer in `packages/ring/release/` |

One test file: `npx jest <name>` inside `packages/service`; `npx playwright test e2e/<file>`
inside `packages/ring` or `packages/ui`.

## Ports

| Port | Used by | Override |
| --- | --- | --- |
| 9119 | Service WebSocket (the app always uses this one) | `ORBIT_WS_PORT`, for tests only |
| 9120 | Config UI dev server (Vite) | `ORBIT_UI_PORT` |
| 9123 | Claude Code approval server of the `claude-usage` plugin (127.0.0.1 only) | — |
| 9129 | Service started by the system test | `ORBIT_SYSTEM_TEST_PORT` |

Never hard-code Vite's stock port 5173, and never write a port number in a second place: read
`ORBIT_UI_PORT` / `ORBIT_WS_PORT` with the defaults above.

## Good practice

- **TDD:** test first, watch it fail, implement the minimum, refactor.
- **Root cause before the fix:** never patch a symptom.
- **Evidence before claims:** say something works only after running it and reading the output.
- **YAGNI and DRY:** the smallest change for what was asked, no speculative abstraction; follow
  the patterns that already exist in the repository.

## Test-driven development

Work test-first. This is a rule, not a preference.

1. **Red** — write a test that states the behaviour and watch it fail for the right reason.
2. **Green** — write the smallest change that makes it pass.
3. **Refactor** — clean up with the tests green.

- A bug fix starts with a test that reproduces the bug. Confirm it fails without the fix.
- New behaviour without a test is not finished. A change that only moves code needs no new test,
  but the existing ones must stay green.
- Tests exercise the **real** module (the suites bundle the `.ts` source with esbuild), not a
  copy of its logic. Mock only the outside world: the network, the home directory, other apps.
- Never weaken, skip or delete a test to get a green run. If a test is wrong, say why in the
  change that fixes it.
- Before saying something works, run it: at least `npm run typecheck` and `npm test`; for
  anything touching the service protocol or plugins also `npm run build && npm run test:system`;
  for UI or ring changes also the relevant Playwright suite.

Where tests go:

| Kind | Location | Runner |
| --- | --- | --- |
| Service and plugin unit tests | `packages/service/src/*.test.js` | jest |
| Plugin compatibility | `packages/service/src/plugins-compat.test.js` | jest |
| System test | `scripts/system-test.cjs` | node |
| Ring behaviour and visual parity | `packages/ring/e2e/*.e2e.test.ts` | Playwright |
| Config UI | `packages/ui/e2e/*.e2e.test.ts` | Playwright |

`ring-loop`, `ring-showcase`, `ring-visual-demo` and `ring-perf` in `packages/ring/e2e` are demos
or load-sensitive measurements, not part of `test:e2e`.

## Test isolation — hard rules

Tests run on developers' real machines, next to their real accounts.

- **Never read or write the real `~/.orbit`.** Use a temp directory; when a whole process is under
  test, redirect `USERPROFILE`, `HOME`, `APPDATA` and `LOCALAPPDATA` to it.
- **A service started by a test never touches the real mouse.** Start it with
  `ORBIT_NO_INPUT_HOOK=1` (no global mouse hook — a stuck hook slows the cursor of the whole
  machine) and `ORBIT_PARENT_PID=<test pid>` (the service exits on its own if the test dies).
- **UI tests always mock the service socket** with `page.routeWebSocket("ws://localhost:9119")`
  before navigating. A UI test must never reach a running service or save a real config.
- **No test talks to a third-party service or another app** (Anthropic, OpenAI, Google, Discord,
  Steam). Stub the transport. Plugins skip account discovery when `JEST_WORKER_ID` is set — keep
  that guard in any new plugin code that looks for credentials.
- Fixtures use invented data: `example.com` addresses, made-up names and ids. No real e-mail,
  username, token or machine path in the repository.

## Privacy and security — hard rules

- Never print, log, persist or send tokens, API keys, refresh tokens or e-mail addresses. Account
  labels shown in the UI are derived, never the raw credential.
- Other tools' data is **read-only**: `~/.claude`, `~/.codex`, `~/.gemini`, Antigravity, Steam,
  PowerToys, and WSL file systems. Never write there, never run commands inside WSL, never wake a
  stopped distro.
- Never refresh or rotate a credential that belongs to another tool unless that tool's own client
  would do it the same way and the plugin's README documents it.
- Local servers bind to `127.0.0.1` only and require the per-install token.
- Nothing a plugin provides is trusted as markup: icons are inner SVG for a 24×24 viewBox, with no
  `<svg>` wrapper, scripts or event handlers.
- The config window opens `https://` links in the system browser and denies every other window.

## Plugins

- `plugins/` is an **opt-in catalog**. Nothing in it is installed by default, on first run or on
  update. Installing is a user action (`install_plugin`); the installed copy lives in
  `~/.orbit/plugins/<folder>`.
- A plugin is `manifest.json` (`id`, `name`, `version` as `x.y.z`, `author`, `description`,
  `main`, `actions`) plus plain CommonJS files. `author` is a GitHub handle such as `@S1LV4`
  (several: comma-separated); the UI links the profile.
- An installed plugin has **no `node_modules`**: it may `require` only Node built-ins and its own
  files. Capabilities that need a native module (e.g. thumbnails) come from the `host` object
  passed to `onLoad(host)`.
- `onUnload()` must stop everything: timers, sockets, servers, retries in flight. After it
  returns, the plugin must not reconnect or log.
- A plugin never throws out of `onLoad`, `getState`, `getActions` or `onAction` for an expected
  condition (tool not installed, no account, offline); it reports that through its state.
- Changing a plugin's behaviour bumps its `version`, so installed copies are offered the update.
- Every plugin has a `README.md` and its own test suite in `packages/service/src/`. The
  compatibility suite and the system test load every catalog plugin automatically; a new plugin
  needs no registration there.
- Installing the Claude Code hook (`plugins/claude-usage/hook/install-hook.js`) edits the user's
  Claude Code settings. Only the user runs it. Never run it from a script, a test or an agent.

## Ring and UI

- `packages/ring/e2e/fixtures/ring-legacy.html` is the frozen visual reference for the parity
  tests. Never edit it; a deliberate visual change updates the tests, not the fixture.
- The ring shows at most `RING_MAX_GROUPS` (8) groups. Extra groups are kept in the config and
  marked hidden in the editor, never dropped.
- A setting added to `RingSettings` must be optional with a default that keeps existing configs
  behaving as before (see `ascii`), and is covered in `config-store.ts`, the ring's `applyConfig`
  and the editor's `useRingDraft`.
- The protocol is defined once in `packages/shared/src/protocol.ts`. A new message is added there
  first, then in the service, then in the UI or ring.
- The attention cue is discreet and always on the primary monitor.

## Code conventions

- TypeScript in `packages/*` (strict); plain CommonJS JavaScript in `plugins/` and in the jest
  suites.
- Code, identifiers, comments and commit messages are in English. User-facing strings follow the
  file they are in.
- **Comments:** comment only what well-written code cannot express — a non-obvious why, an
  external constraint. Never comment what the code does. The codebase carries no comments today;
  a new one has to earn its place under this rule.
- No new runtime dependency without a reason stated in the change; native modules must have
  Windows x64 prebuilt binaries (the installer does not rebuild them).
- Windows is the only supported platform today. Platform-specific code checks the platform and
  degrades to a clear state elsewhere.

## Versions and releases

- One version for the app: `version` in the root and in the four `packages/*/package.json`, plus
  the label in `packages/ui/src/App.tsx`. They change together.
- A release is a tag `vX.Y.Z` equal to that version. CI refuses a tag that does not match, builds
  `OrbitRing-Setup-X.Y.Z.exe` and publishes the GitHub Release. A tag with a hyphen
  (`v1.1.0-beta.1`) is published as a pre-release.
- The installer is not code-signed.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `ci:`,
  `refactor:`, `chore:`).

## For agents

- Do not commit, push, tag, publish a release or change the remote unless the owner asks for that
  step. Approval for one of them is not approval for the next.
- Do not kill the owner's running OrbitRing to make a test pass; use the override ports above.
- Do not change files outside the repository — in particular the user's `~/.orbit`,
  `~/.claude/settings.json` or any credential store.
- Report what actually ran and what did not. A test that was not run is reported as not run.
