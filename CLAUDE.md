# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **static single-page renderer** for Portia climate risk dashboards. There is NO framework, NO build system, NO npm, NO bundler. Three files do everything: `index.html`, `app.js`, `style.css`. Hosted on GitHub Pages at `https://atram-inc.github.io/portia-dashboard/`. The Python tool in the sibling `portia-climate-data` repo generates a gzipped + base64url-encoded JSON payload and either embeds it in a URL or publishes it as a gist; this page decodes it client-side and renders the dashboard.

## Common commands

There are no scripts — no `package.json` exists. To work on this:

| Task | How |
|------|-----|
| Edit + preview locally | `python -m http.server 8000`, then open `http://localhost:8000/?id=<gist_id>` |
| Deploy | Push to `main` → GitHub Pages auto-deploys in ~30s |

To test with real data, grab a `?id=...` or `?d=...` URL from a recent Portia tool run and append the query string to your local URL.

## High-level architecture

**Render flow (all in `app.js`):**

1. `index.html` runs an inline `<script>` in `<head>` that reads `localStorage["portia.theme"]` and sets `data-theme="light"` or `"dark"` on `<html>` before first paint (avoids flash of wrong theme).
2. `app.js` is an IIFE; `main()` runs at the bottom of the file.
3. `getPayload()` reads `?d=<base64url>` (direct, prod default) or `?id=<gist_id>` (fetches from `api.github.com/gists/...`), then uses the native `DecompressionStream` API for gzip → JSON.
4. A sequence of `renderX()` functions populates DOM panels: `renderTopbar`, `renderSummary`, `renderBranches`, `renderWater`, `renderTrajectory`, `renderSite`, `renderContext`, `renderFooter`.
5. Tabs are pure DOM class toggles (`.active` on nav items + `.panel` divs) — there is no router and the URL does not change on tab switch. Branch table sort/filter state lives in a single `branchState` object.

**The expected payload JSON shape is documented in `app.js` lines 8–33.** This is the contract with `portia-climate-data` — if either side changes, both must update. There is no payload validation; malformed payloads silently misrender.

## Critical conventions

- **Theme custom properties live in two CSS blocks that must stay in sync.** Colors are defined under `:root, :root[data-theme="dark"]` and again under `:root[data-theme="light"]` near the top of `style.css`. Add/edit colors in both.
- **Theme storage key is `portia.theme`.** Used by the inline script in `index.html` AND by `initThemeToggle()` in `app.js`. Change both if you rename it.
- **Nav icons are CSS masks, not `<img>` tags.** PNG masks in `assets/icons/` are applied via `mask-image`; their color comes from CSS `color`. Editing a PNG icon requires preserving the alpha channel.
- **Optional sections render only when their data exists.** Water, trajectory, site, and context panels (and their nav entries) check the payload and skip themselves if missing. Preserve this — empty panels look broken.
- **Payload version is `v: 1`.** If the shape changes, bump `v` in the Python tool and add version-aware branching in `app.js` rather than breaking v1 consumers (old gist URLs still in the wild).
- **No external JS/CSS dependencies.** Do not add npm, a bundler, or a framework without an explicit conversation — the entire point of this repo is "push three files, GitHub Pages serves them."

## Browser support

Requires `DecompressionStream` (Chrome 80+, Firefox 113+, Safari 16.4+). No polyfills.

## Related repos

- **portia-climate-data** (`../portia-climate-data`) — The Python tool there generates the URLs this page renders. Payload shape contract lives in `app.js` lines 8–33.

## Existing rules

No `.cursorrules`, `.cursor/rules/`, or Copilot instructions exist. This file is the first.
