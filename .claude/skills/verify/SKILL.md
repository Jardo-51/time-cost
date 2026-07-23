---
name: verify
description: Build, run, and visually verify time-cost in headless Firefox with seeded IndexedDB data
---

# Verifying time-cost visually

## Build & serve

```bash
nix develop -c pnpm build          # bare pnpm is not on PATH
nix develop -c pnpm preview --port 4173   # run from repo root (needs flake.nix)
socat TCP-LISTEN:4199,fork,reuseaddr SYSTEM:'sleep 95' &   # load-event blocker
```

For screenshots that include Chart.js charts, temporarily add
`Chart.defaults.animation = false` in `src/plugins/chartjs.ts` before the
build (headless Firefox never advances requestAnimationFrame, so animated
canvases capture blank). Revert and rebuild afterwards.

## Drive & capture

Copy `seed-wrapper.html` (next to this file) to `dist/_seed.html`, then:

```bash
firefox --headless --no-remote --profile $(mktemp -d) --window-size=420,900 \
  --screenshot out.png 'http://localhost:4173/_seed.html?route=/&action=edit'
```

The wrapper blocks the page `load` event with a hanging `<img>` served by the
socat port, seeds IndexedDB `time-cost` (tags, expenses, income period) from
the same origin, reloads the app iframe on `route`, optionally performs
`action`, then releases the img so Firefox captures. Actions implemented:
`edit` (open expense edit dialog), `filter` (pick tag filter on /stats),
`filter-year` / `filter-day` (switch period then filter), `delete-tag`
(delete a tag on /settings/tags, then show home). `dark=1` / `dark=0` pins the
theme by writing the app's `darkMode` localStorage key on the shared origin.
Failures appear as a red banner across the top of the screenshot; no banner =
script ran clean.

## Gotchas

- **Vuetify overlays (dialogs, select menus) exist in the DOM but paint
  invisible** in headless screenshots: Vue enter-transitions advance via
  requestAnimationFrame, which never ticks. Call the wrapper's
  `forceShowOverlays()` after opening one (strips `*-enter*` classes, forces
  opacity/transform).
- Synthetic clicks need the full pointerdown/mousedown/pointerup/mouseup/click
  sequence (`realClick()` in the wrapper); a bare `.click()` is not always
  enough for Vuetify controls.
- Seeding must happen while the schema already exists: the wrapper loads the
  app once (Dexie creates/upgrades), writes via raw IndexedDB, then reloads.
- Unit tests: `nix develop -c pnpm vitest run`; lint `nix develop -c pnpm lint`;
  types `nix develop -c pnpm exec vue-tsc --noEmit -p tsconfig.app.json`.
