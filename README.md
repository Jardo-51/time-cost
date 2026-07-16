# Time Cost

A PWA that tracks your expenses in **worktime** — every expense is shown both in money and in the time you had to work to earn it. A €4.50 coffee at €40/hour is "6m 45s"; a €12,800 car is "2mo".

No registration, fully offline: all data lives in your browser (IndexedDB). Optionally, an [EteSync](https://www.etesync.com/) (Etebase) account can be configured to sync end-to-end encrypted data between devices.

## Features

- **Worktime display** — expenses formatted as the two largest work units: `3m 17s`, `2h 14m`, `1d 3h`, `2w 3d`, `3mo 2w`, `1y 4mo`. A workday/workweek is configurable (default 8 h/day, 5 days/week); 4 workweeks = 1 month, 12 months = 1 year.
- **Income history** — income is a list of dated periods ("€60/h from 2026-08-01"). An expense's worktime uses the income valid on the *expense's date*, so a raise never rewrites what past expenses cost you, and corrections apply retroactively.
- **Multi-currency** — each expense can have its own currency. ECB rates are fetched from the free [frankfurter](https://frankfurter.dev/) API and cached for offline use; the converted base amount is snapshotted on the expense at entry so rate changes never alter history. Currencies without automatic rates can be added manually (and manual rates override automatic ones).
- **Categories** — seeded defaults, fully editable (icon + color); deleting a category moves its expenses to "Other".
- **Quick-add templates** — one-tap chips for recurring expenses (coffee, transport ticket, rent…).
- **Statistics** — day/week/month/year periods with totals in money *and* worktime, category doughnut, spend-over-time bars (Chart.js, follows light/dark theme).
- **EteSync sync** — optional, local-first. Mutations are debounced and pushed as encrypted items (one item per record) into a `com.timecost.app` collection; conflicts resolve last-write-wins by modification time. Works offline; syncs on reconnect. Logging out keeps all local data.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Vue 3 (Composition API) + TypeScript |
| UI | Vuetify 4 + Material Design Icons |
| State | Pinia |
| Storage | Dexie (IndexedDB) |
| Charts | Chart.js + vue-chartjs |
| Sync | etebase (EteSync 2.0 SDK, end-to-end encrypted) |
| Routing | Vue Router |
| Build | Vite + vite-plugin-pwa |
| Tests | Vitest (unit + sync e2e) |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Lint
pnpm lint

# Run tests
pnpm test
```

Alternatively, if you use [Nix](https://nixos.org/), you can run commands via the project's dev shell:

```bash
nix develop -c pnpm dev
```

### Sync end-to-end tests

`pnpm test` includes an e2e suite for the sync engine that runs against a real local Etebase server and **self-skips** when none is reachable. To run it:

```bash
docker run -d --name etebase -p 3735:3735 \
  -e ALLOWED_HOSTS=localhost,127.0.0.1 \
  victorrds/etesync:alpine

# `docker run -d` returns once the container exists, not once it's ready, so
# wait for the entrypoint to finish migrating before touching the database —
# otherwise createsuperuser races it and fails on a cold machine.
until docker exec etebase python /etebase/manage.py migrate --check >/dev/null 2>&1; do sleep 1; done

# The suite signs up on first run but logs in on later ones, so the account
# has to exist on the server — otherwise it fails with `UnauthorizedError:
# User not found`.
docker exec -e DJANGO_SUPERUSER_PASSWORD='test-password-123' etebase \
  python /etebase/manage.py createsuperuser --noinput \
  --username admin --email admin@example.com

pnpm test
```

The credentials default to `admin` / `test-password-123`; override them with
`ETEBASE_TEST_USER`, `ETEBASE_TEST_PASSWORD`, and `ETEBASE_URL`.

## Project Structure

```
src/
├── pages/            # Route-level pages (Home, Stats, Settings, Categories, Templates)
├── components/
│   ├── expenses/     # Expense list, form dialog (live worktime preview), quick-add chips
│   ├── stats/        # Period picker, totals, doughnut, bar chart, breakdown
│   ├── settings/     # Income (with history), EteSync, exchange rates, theme
│   ├── categories/   # Category editor (icon/color pickers)
│   ├── templates/    # Quick-add template editor
│   └── layout/       # Bottom navigation
├── stores/           # Pinia stores — Dexie-first writes, then refs, then scheduleSync()
├── services/
│   ├── fx.ts         # frankfurter (ECB) rates fetch
│   └── sync/         # Etebase wrapper + pull/push/LWW engine (lazy-loaded chunk)
├── db/               # Dexie schema + first-run seeding
├── utils/            # worktime ladder math, date periods, money formatting
├── composables/      # useWorktime — expense → worktime string
├── constants/        # default categories, ECB currency list
├── plugins/          # Vuetify, Pinia, Router, Chart.js registration + theme bridge
├── bootstrap.ts      # open db → seed → hydrate stores before mount
└── main.ts           # App entry point
```

### Data & sync model

Every record carries `{ id, modifiedAt, deleted }`. Deletes are tombstones so they propagate through sync (purged 90 days after a confirmed push). Seeded categories use deterministic ids (`default-food`, …) so independently-seeded devices merge instead of duplicating. The FX cache is a canonical EUR-based table; any→any conversion uses cross rates, so changing the base currency needs no refetch (income amounts and expense snapshots are converted with the current rate).

## PWA & Offline Support

- Installable on mobile and desktop — runs as a standalone app
- Full offline functionality via service worker caching; the FX API uses a NetworkFirst runtime cache (Etebase traffic is deliberately never cached)
- Auto-updates when a new version is deployed

## Deployment

GitHub Actions workflows are included:

- **Build** — runs on every push: lint, tests, and production build
- **Deploy** — manual trigger, builds and deploys via `rsync` over SSH

Required repository secrets for deployment:

| Secret | Description |
|---|---|
| `DEPLOY_KEY` | SSH private key |
| `DEPLOY_HOST_KEY` | Known hosts entry for the target server |
| `DEPLOY_URL` | rsync destination (e.g. `user@host:/var/www/app/`) |
