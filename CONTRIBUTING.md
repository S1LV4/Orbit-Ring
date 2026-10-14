# Contributing to OrbitRing

Thanks for wanting to help. OrbitRing is a radial actions menu and mouse-button remapper for
Windows, with a plugin system. This page gets you from a clone to a pull request; the full
development rules are in [AGENTS.md](AGENTS.md) and apply to every contribution.

## What you need

- Windows 10 or 11, x64 (the only supported platform today)
- Node.js 24 and npm
- Git

## Getting started

```
git clone https://github.com/S1LV4/Orbit-Ring.git
cd Orbit-Ring
npm ci
npm run dev
```

`npm run dev` builds everything and starts the service, the config UI dev server and the ring
with its tray icon. The plugins in `plugins/` show up in the **Plugins** tab as a catalog; none is
installed until you click Install.

Ports: the service listens on 9119 and the UI dev server on 9120 (`ORBIT_UI_PORT` changes it).

## How we work: tests first

Changes are developed test-first:

1. Write a test that describes the behaviour and see it **fail**.
2. Make it pass with the smallest change.
3. Tidy up with the tests green.

A bug fix comes with a test that fails without the fix. A feature comes with tests for it. Pull
requests that change behaviour without tests will be asked for them.

### Running the tests

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | Types in the four packages |
| `npm test` | Service and plugin unit tests |
| `npm run test:plugins` | Every catalog plugin: manifest contract, install, load, unload |
| `npm run build && npm run test:system` | The built service, driven over its WebSocket |
| `npm run test:e2e` | Ring and config UI in a browser (first time: `npx playwright install chromium`) |
| `npm run test:all` | All of the above, as CI runs them |

The tests are safe to run on your own machine: they use temporary folders, never your real
`~/.orbit`, and never contact outside services. Keep it that way in the tests you write — see
"Test isolation" in [AGENTS.md](AGENTS.md).

CI runs the same commands on every push and pull request, then builds the installer.

## Pull requests

- Branch from `main`, keep the change focused on one thing.
- `npm run typecheck` and `npm test` pass; so do the system and end-to-end tests for anything that
  touches the service protocol, plugins, the ring or the UI.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat: …`, `fix: …`, `test: …`, `docs: …`.
- Say in the description what changed, why, and how you tested it. Screenshots help for visual
  changes.
- Do not include generated files you did not mean to change, and never include tokens, keys,
  e-mail addresses or paths from your machine — in code, fixtures, logs or screenshots.

## Writing a plugin

A plugin is a folder with a `manifest.json` and CommonJS files:

```json
{
  "id": "com.example.hello",
  "name": "Hello",
  "version": "1.0.0",
  "author": "@your-github-handle",
  "description": "What it does, in one or two sentences.",
  "main": "index.js",
  "actions": [{ "id": "wave", "name": "Hello · Wave" }]
}
```

```js
module.exports = {
  onLoad(host) {},          // start; `host` gives access to app services
  onUnload() {},            // stop everything: timers, sockets, servers
  getState() { return {}; },// optional live state per action id
  async onAction(id) {},    // the user picked an action
};
```

Rules that the compatibility tests enforce or that reviewers will check:

- Only Node built-ins and the plugin's own files may be `require`d — an installed plugin has no
  `node_modules`.
- `onUnload()` leaves nothing running.
- A missing tool, account or connection is a state shown to the user, not an exception.
- Read other applications' data read-only, and never log or store credentials.
- Icons are inner SVG markup for a 24×24 viewBox (no `<svg>` wrapper).
- Include a `README.md`, and a test suite in `packages/service/src/`.

To try it, drop the folder in `~/.orbit/plugins/` (the **Plugins folder** button opens it) and
restart OrbitRing. To propose it for the catalog, add it under `plugins/` in a pull request. The
existing plugins there are the best reference.

## Translating

OrbitRing speaks English, Portuguese (Brazil) and Spanish, picked from the Windows language (English when Windows uses another language). The
texts are in `packages/shared/locales/<language>/`, one JSON file per area of the app.

- To fix a translation, edit the value in that language's file.
- To add a language, copy the `en-US` folder to a folder named with the language tag (for example
  `fr-FR`), translate the values — keep every key and every `{placeholder}` — and register it in
  `packages/shared/src/i18n.ts`. `npm test` tells you if a key or placeholder is missing.
- Texts that depend on a number use plural forms: `{ "one": "{count} ação", "other": "{count} ações" }`.
  Use the [plural categories](https://cldr.unicode.org/index/cldr-spec/plural-rules) of your language.

## Reporting bugs and ideas

Open an issue at https://github.com/S1LV4/Orbit-Ring/issues with your Windows version, the
OrbitRing version, what you did, what you expected and what happened. Remove tokens and personal
data from anything you paste.

For a security problem, please do not open a public issue with the details; contact the maintainer
through the GitHub profile [@S1LV4](https://github.com/S1LV4) first.

## Licence

OrbitRing is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only). By
contributing you agree that your contribution is released under the same licence. Third-party
logos used to identify tools remain trademarks of their owners; see
`packages/shared/src/BRAND-ICONS.md`.
