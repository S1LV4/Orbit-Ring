# Brand icons

Provenance of the marks in `BRAND` (`ring-catalog.ts`) and of their literal copies in
`plugins/*/manifest.json` (kept identical by `packages/service/src/plugin-manifest-icons.test.js`).

**Trademark note:** these logos are trademarks of their respective owners. OrbitRing uses them
only to identify the user's own tools (nominative use), unmodified in shape, in a single neutral
colour; no affiliation or endorsement is implied. Licences below cover the SVG files, not the
trademarks.

All marks are stored as one `<path fill="currentColor" stroke="none" d="…"/>` for a 24×24 viewBox.
Retrieved 2026-10-13.

| Key | Mark | Source | Licence of the file | Changes |
| --- | --- | --- | --- | --- |
| `claude` | Claude spark | Simple Icons 16.35.0, `icons/claude.svg` — https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/claude.svg (their source: https://claude.ai) | Simple Icons collection: CC0 1.0. No per-icon licence recorded. | none (path verbatim) |
| `gemini` | Google Gemini spark | Simple Icons 16.35.0, `icons/googlegemini.svg` — https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/googlegemini.svg (their source: https://gemini.google.com) | Simple Icons collection: CC0 1.0. No per-icon licence recorded. | none |
| `cursor` | Cursor cube | Simple Icons 16.35.0, `icons/cursor.svg` — https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/cursor.svg (their source: https://cursor.com/brand) | Simple Icons collection: CC0 1.0. No per-icon licence recorded. | none |
| `copilot` | GitHub Copilot | Simple Icons 16.35.0, `icons/githubcopilot.svg` — https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/githubcopilot.svg (their source: https://primer.style/foundations/icons/copilot-24) | MIT (GitHub Primer Octicons), as recorded by Simple Icons | none |
| `openai` | OpenAI "Blossom" | OpenAI's own brand kit: `OpenAI-logos/SVGs/OAI_OpenAI-Blossom_Black.svg` inside https://cdn.openai.com/brand/openai-logos.zip (linked from https://openai.com/brand/) | No open licence: use is governed by OpenAI's brand guidelines (https://openai.com/brand/). | Path rescaled from the 716×716 artboard to fill the 24×24 box (uniform scale + translate, coordinates rounded to 3 decimals); colour replaced by `currentColor`. Shape unchanged. |
| `antigravity` | Google Antigravity | The app's own asset, Antigravity 1.19.6 for Windows: `resources/app/out/media/jetski-logo-black.svg` (single-path vector; "jetski" is the app's internal name for the mark) | No open licence: proprietary Google asset shipped with the app. | Path rescaled from the 112×112 artboard to fill the 24×24 box (uniform scale + translate, rounded to 3 decimals); colour replaced by `currentColor`. Shape unchanged. |

Notes

- Simple Icons removed OpenAI in v16.0.0 (PR simple-icons/simple-icons#13944, no permission from
  the brand owner), so that mark comes from the vendor's kit instead of Simple Icons.
- Simple Icons' disclaimer: the collection is CC0, which does not imply every brand's icon is;
  check https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md when updating.
- Simple Icons has no Antigravity or Codex icon (16.35.0). Codex uses the OpenAI mark.
- To update a mark: replace the path in `BRAND`, copy it (single-quoted) into the manifests that
  use it, run `npm test -w packages/service`, and update the row above.

## Steam (plugin `plugins/steam`)

Not part of `BRAND` in `ring-catalog.ts`: the mark lives only in `plugins/steam/manifest.json`
(actions `playing` and `downloads`; `index.js` reuses it as the fallback icon of the per-game
actions). `packages/service/src/steam-plugin.test.js` pins the path by its SHA-256.

| Mark | Source | Licence of the file | Changes |
| --- | --- | --- | --- |
| Steam logo | Simple Icons 16.35.0, `icons/steam.svg` (slug `steam`) — https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/steam.svg (their source and brand guidelines: https://partner.steamgames.com/doc/marketing/branding). Retrieved 2026-10-13. | Simple Icons collection: CC0 1.0. No per-icon licence recorded. | none (path verbatim, wrapped as `<path fill='currentColor' stroke='none' d='…'/>`) |

Trademark: Steam and the Steam logo are trademarks and/or registered trademarks of Valve
Corporation. The plugin uses the mark only to identify the user's own Steam client (nominative
use), unmodified in shape, in a single neutral colour; it is not affiliated with or endorsed by
Valve. Game cover art shown on the buttons is never stored in this repository: it is read at
runtime from the user's own Steam client cache (or Valve's public CDN) and belongs to the
respective publishers.
