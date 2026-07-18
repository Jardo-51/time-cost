# Code Review — 2026-07-07

Comprehensive review of the entire Time Cost codebase (app source, sync engine, tests, build/deploy config).

Severity legend:

- **CRITICAL** — will cause bugs, data loss, or security issues if shipped as-is.
- **HIGH** — significant design flaw or performance problem; should be fixed before shipping.
- **MEDIUM** — best-practice violation or maintenance burden; fix recommended.
- **LOW** — style, minor improvement, nitpick.

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| HIGH | 3 |
| MEDIUM | 8 |
| LOW | 15 |

---

## CRITICAL

- [x] **1. CSP `connect-src 'self'` blocks the FX API and all Etebase sync in production** — `public/.htaccess:11`
  The deployed Content-Security-Policy only allows `connect-src 'self'`, but the app fetches `https://api.frankfurter.dev` (`src/services/fx.ts:3`) and the user-configured Etebase server (login, `isEtebaseServer`, every sync request). All of these are blocked by the browser under this policy, including the service worker's `NetworkFirst` fetch for FX (the SW inherits the CSP served with `sw.js`, which `Header set` applies to). Exchange rates and sync work in `pnpm dev` but fail completely on the Apache deployment.
  **Fix:** `connect-src 'self' https://api.frankfurter.dev https:;` — the trailing `https:` (or a documented allowlist) is required because the Etebase server hostname is user-configured and unknown at build time.

- [x] **2. First-run seeding stamps `modifiedAt = Date.now()`, so a fresh device overwrites synced category edits (data loss)** — `src/db/seed.ts:10-17`
  Scenario: the user renamed the default "Food" category to "Groceries" a week ago (remote `modifiedAt` = last week). They log in on a new device. Bootstrap seeds `default-food` with `modifiedAt = now` *before* the first sync. During pull, `applyRemoteRecord` sees `remoteModifiedAt <= local.modifiedAt` and keeps the freshly seeded default (`src/services/sync/engine.ts:171`); during push the seed is dirty (`lastSyncedModifiedAt` = 0) and is uploaded, permanently reverting the user's rename on **all** devices. The e2e suite doesn't catch this because it never edits a seeded category.
  **Fix:** seed default records with `modifiedAt: 0` (or a fixed epoch constant) so any genuine user edit always wins LWW. The seeds still merge cleanly between two truly-fresh devices.

## HIGH

- [x] **3. `baseAmountOf` ignores `expense.baseCurrency`, so snapshots denominated in an old base are displayed and summed as the new base** — `src/composables/useWorktime.ts:17-21`, `src/stores/expenses.ts:88-108`
  `Expense.baseAmount` carries a `baseCurrency` field precisely because snapshots can be in a different currency than the current base, but no consumer checks it. Two ways to get a mismatch: (a) finding 4 below (base change with no rates); (b) a sync race — device B creates an expense (snapshot in EUR) while device A has already switched the base to USD; B's expense syncs with `baseCurrency: 'EUR'` and nobody ever rebases it. The stale EUR number is then formatted as USD in list items and added into USD totals/charts. `backfillBaseAmounts` only repairs `baseAmount == null`, never a currency mismatch.
  **Fix:** in `baseAmountOf` (and the stats aggregations), treat `expense.baseCurrency !== settings.baseCurrency` the same as a missing snapshot (recompute via `fx.toBase`, or rebase-and-persist), and extend `backfillBaseAmounts` to repair mismatched snapshots.

- [x] **4. `saveBaseCurrency` switches the base even when no conversion rate exists, silently reinterpreting all stored amounts** — `src/stores/settings.ts:35-67`
  When `factor === null` (offline first run, unknown custom base), the function still persists the new `baseCurrency` but leaves every income period amount and every expense `baseAmount` in the *old* currency. A one-time snackbar warns about income, but expenses are silently wrong forever (see finding 3), and nothing reconciles them once rates arrive.
  **Fix:** either refuse the switch until a rate is known, or convert lazily-but-correctly by honoring the per-record `baseCurrency` field (finding 3) and rebasing income periods when a rate first appears.

- [x] **5. Deleting a category on one device orphans expenses created concurrently on another device, and stats silently drop them** — `src/stores/categories.ts:61-80`, `src/pages/StatsPage.vue:102-103`
  `remove()` reassigns to "Other" only the expenses *known locally*. An expense created offline on device B in that category syncs later and keeps a `categoryId` pointing at a tombstone forever. In `StatsPage.categoryStats` such expenses hit `if (!category) continue` — they are counted in the totals card but vanish from the doughnut and breakdown, so shares don't add up and money silently "disappears" from the breakdown. The expense list falls back to a grey "?" avatar, which is fine, but stats should not drop data.
  **Fix:** map unknown/tombstoned `categoryId`s to the protected "Other" category during stats aggregation (or lazily repair records to `OTHER_CATEGORY_ID` on hydrate when the referenced category is deleted).

## MEDIUM

- [x] **6. First-sync race can create two Etebase collections → permanent split-brain** — `src/services/sync/etebase.ts:105-114`
  `getCollection` does list-then-create with no uniqueness guarantee. If two devices run their first sync concurrently (or a retry after a partial failure), each creates its own `com.timecost.app` collection. Afterwards `data.find(c => !c.isDeleted)` picks an arbitrary one per device and the account's data is silently split in two.
  **Fix:** after creating, re-list and prefer a deterministic winner (e.g. lowest `uid`), migrating items if the local collection lost; or at minimum surface an error when more than one non-deleted collection exists.

- [x] **7. The sync engine — the most intricate module — has zero test coverage in CI** — `src/services/sync/__tests__/engine.e2e.spec.ts:38`, `.github/workflows/build.yml`
  The only tests for `engine.ts` are e2e tests that self-skip when no Etebase server is reachable, and the CI workflow doesn't start one. All LWW/tombstone/stoken logic is effectively unverified on every push.
  **Fix:** either start the `victorrds/etesync` container as a service in `build.yml`, or add unit tests for `applyRemoteRecord`/`collectDirty`/`purgeOldTombstones` with a mocked item manager (they are pure-ish over Dexie + fake-indexeddb).
  _Not applicable: already resolved. `.github/workflows/build.yml` now starts the `victorrds/etesync` container (pinned by digest), waits for it to migrate and listen, creates the test account, and runs `pnpm test` with `ETEBASE_REQUIRED=1` (lines 37-69) — which turns the e2e suite's self-skip into a hard build failure. The engine's LWW/tombstone/stoken paths are exercised against a real server on every push. This was the review's first suggested fix._

- [x] **8. Bootstrap failure is swallowed: the app mounts with empty stores and an unhandled rejection** — `src/main.ts:25`, `src/bootstrap.ts`
  `bootstrap().finally(() => app.mount('#app'))` mounts even when IndexedDB is unavailable (Firefox private browsing, storage pressure) or seeding/hydration throws. The user sees the "Add your first expense" empty state over their real (inaccessible) data, and the rejection escapes unhandled.
  **Fix:** `.catch` the bootstrap error, surface a "storage unavailable / failed to load data" screen or snackbar, and log the error.

- [x] **9. Pull applies remote records with a non-transactional read-compare-write, so a concurrent local edit can be lost even when it is newer** — `src/services/sync/engine.ts:144-177`
  `applyRemoteRecord` does `table.get(localId)` → compare → `table.put(...)`. If the user saves an edit between the get and the put (sync runs in the background while the UI is live), the put overwrites the fresh edit with remote data even though the edit's `modifiedAt` is newer — violating the engine's own LWW contract.
  **Fix:** wrap the get/compare/put per record in `db.transaction('rw', table, ...)` so the comparison and write are atomic.

- [x] **10. No double-submit guard on record creation: quick-add chips and dialog Save buttons create duplicates on double tap** — `src/components/expenses/QuickAddRow.vue:36`, `src/components/expenses/ExpenseFormDialog.vue:168`, `src/components/templates/TemplateFormDialog.vue:111`
  All create paths are `async` with the button left enabled while awaiting; a double tap (common on mobile, the primary target) inserts two records.
  **Fix:** a `saving` ref driving `:disabled`/`:loading` on the buttons, and a short in-flight guard on `quickAdd`.

- [x] **11. Every data store duplicates the same tombstone-CRUD boilerplate** — `src/stores/expenses.ts`, `categories.ts`, `templates.ts`, `settings.ts` (income periods), `fx.ts` (custom rates)
  Five stores repeat hydrate-filter-deleted, add-with-uuid/modifiedAt, update-find-merge-put, remove-tombstone-put, plus `scheduleSync()` after each. That is ~150 duplicated lines where a bug fix (e.g. finding 9's transactional discipline, or a future `modifiedAt` change) must be applied five times.
  **Fix:** extract a small generic helper (e.g. `createSyncedTable<T>(table)` returning `hydrate/add/update/remove`) and compose stores from it.
  _Fixed: `src/stores/syncedTable.ts` — `createSyncedTable<T>` owns hydrate/add/update/remove plus a `write` primitive (put + reactive-list update + `scheduleSync`, stamping `modifiedAt` via `nextModifiedAt`). Every store composes it: expenses/tags (build), categories/templates/income periods (build + custom hydrate/remove), and fx custom rates use `write`/`remove` for their upsert shape. Store-specific behaviour (expense snapshots, category/tag cascade deletes, template reorder, base-currency conversion) layers on top. Verified with the full suite including the sync e2e run against a live Etebase server (66 passing)._

- [x] **12. LWW conflict resolution trusts unsynchronized device clocks** — `src/services/sync/engine.ts:14`, all stores' `modifiedAt: Date.now()`
  A device with a clock set hours ahead permanently wins every conflict, and `remoteModifiedAt <= local.modifiedAt` equality (`engine.ts:171`) treats an exact tie as "already applied". This is an accepted design tradeoff for this app class, but it deserves a documented mitigation (e.g. clamping `modifiedAt` to `max(Date.now(), lastKnown + 1)` monotonically per device).
  _Fixed: `src/utils/clock.ts` adds `nextModifiedAt()` — a per-device monotonic clamp `max(Date.now(), last + 1)` — and every store now stamps `modifiedAt` through it instead of `Date.now()`. `observeModifiedAt()` feeds it every remote timestamp during pull so a local edit is never minted behind a revision the device has already seen. The engine header documents the tie/monotonic behaviour and that cross-device skew remains an accepted tradeoff._

- [x] **13. `applyRemoteSettings` reports success for an unparsable payload** — `src/services/sync/engine.ts:129-131`
  When the item content fails to parse (`payload === null`), the function returns `true` ("local copy matches remote"), so `lastSyncedModifiedAt` is set to the remote revision even though nothing was applied. Harmless today (local settings newer would still be pushed), but it corrupts the meaning of the sync bookkeeping and will bite any future logic built on it. `applyRemoteRecord` correctly returns `false` in the same situation.

## LOW

- [x] **14. Date validity is only regex-checked, so impossible dates like `2026-13-40` are storable** — `src/components/expenses/ExpenseFormDialog.vue:146`
  `/^\d{4}-\d{2}-\d{2}$/` accepts non-existent calendar dates. Native `type="date"` inputs usually prevent this, but not every browser/platform does. Such a date sorts oddly and never matches any stats bucket. Validate via `toISODate(parseISODate(v)) === v` round-trip.

- [x] **15. `backfillBaseAmounts` is O(n²) and triggers reactivity per repaired expense** — `src/stores/expenses.ts:88-108`
  Each repaired expense rebuilds the whole `expenses.value` array via `.map`. Collect the updates, `bulkPut` once, and reassign the array once.
  _Folded into the fix for #3/#4: the function (now `resyncBaseSnapshots`) collects repairs into a map, `bulkPut`s once, and reassigns the array once._

- [ ] **16. Every sync run loads all tables into memory twice** — `src/services/sync/engine.ts:218-237, 298-310`
  `collectDirty` does `table.toArray()` for all five tables, and `purgeOldTombstones` does it again to filter a handful of tombstones. Fine at hundreds of records; wasteful at years of expense history. Use the `modifiedAt` index (`where('modifiedAt').above(...)` needs a per-table dirty watermark, or at least `filter` on a `deleted`-indexed query for the purge).

- [x] **17. Template reassignment on category delete does a full-table `filter` scan** — `src/stores/categories.ts:72-74`
  `db.templates` has no `categoryId` index (`src/db/index.ts:29`), so the code falls back to `.filter()`. Either add the index in a `version(2)` block or (given template counts are tiny) leave it but note why `filter` is used, unlike the indexed `where` used for expenses two lines above.

- [x] **18. Concurrent template creation on two devices produces duplicate `sortOrder`s, making `move()` a no-op** — `src/stores/templates.ts:22-34, 57-71`
  Both devices compute `maxOrder + 1` independently; after sync two templates share a `sortOrder`, so the swap in `move()` exchanges equal values and the order becomes unstable (secondary sort is undefined). Consider tie-breaking sorts by `id` and renumbering on collision.

- [ ] **19. Dark mode ignores `prefers-color-scheme` and flashes light theme at startup** — `src/stores/app.ts:8`, `src/plugins/vuetify.ts:6-8`
  First-time users get light mode regardless of OS preference, and returning dark-mode users see a light flash until `App.vue`'s watcher runs. Default from `window.matchMedia('(prefers-color-scheme: dark)')` when localStorage is empty, and consider setting the initial Vuetify theme before mount.

- [ ] **20. `lastCurrency` from localStorage is not validated against available currencies** — `src/components/expenses/ExpenseFormDialog.vue:133`
  If the remembered currency was a custom rate that has since been removed, the form silently preselects a currency with no rate: the preview shows "no exchange rate yet" and the saved expense gets `baseAmount: null`. Fall back to `settings.baseCurrency` when the code is not in `fx.currencies`. Also note the inconsistency: this and `darkMode` live in localStorage while every other setting lives in the Dexie `meta` table.

- [ ] **21. Icon-only buttons lack accessible labels** — throughout (e.g. `src/pages/CategoriesPage.vue:24-37`, `src/pages/TemplatesPage.vue:40-68`, `src/components/stats/PeriodPicker.vue:20-34`, the FAB in `src/pages/HomePage.vue:40-46`)
  Screen readers announce nothing useful for `icon="mdi-pencil"` buttons. Add `aria-label` (Vuetify passes it through) to edit/delete/move/navigation icon buttons.

- [x] **22. `workbox-window` appears to be an unused dependency** — `package.json:28`
  Nothing in `src/` imports it or the `virtual:pwa-register` module; `vite-plugin-pwa`'s auto-injected `registerSW.js` doesn't need it. Remove it (or switch to `useRegisterSW` for a proper "update available" prompt, which would then justify it).

- [x] **23. `define: { 'process.env': {} }` is template leftover** — `vite.config.mts:93`
  Nothing in the app reads `process.env` at runtime. Shims like this can mask real misconfigurations in dependencies; remove unless a dependency demonstrably needs it.

- [x] **24. `src/styles/settings.scss` is dead boilerplate** — the file is only comments, yet it is wired into `vite-plugin-vuetify` (`vite.config.mts:16`), which forces the slower `configFile` style pipeline. Either use it or drop the `styles.configFile` option and the file.

- [x] **25. README e2e credentials don't match the test defaults** — `README.md:61-64` vs `src/services/sync/__tests__/engine.e2e.spec.ts:42-43`
  README starts the container with `SUPER_PASS=adminpass123`, while the test defaults to `test-password-123` (as the *Etebase* account password set during the signup handshake, distinct from the Django password). This works but is non-obvious; document `ETEBASE_TEST_USER`/`ETEBASE_TEST_PASSWORD` next to the docker command so the relationship is clear.
  _Not applicable: already resolved (folded into the #7 CI work). The README now runs `createsuperuser` with `DJANGO_SUPERUSER_PASSWORD='test-password-123'` — matching the test default `admin` / `test-password-123` — and explicitly documents the `ETEBASE_TEST_USER` / `ETEBASE_TEST_PASSWORD` / `ETEBASE_URL` overrides right beside the docker command (README.md:82-83). The `SUPER_PASS=adminpass123` mismatch the finding describes no longer exists._

- [x] **26. `index.html` has no explicit `Cache-Control` header** — `public/.htaccess`
  Hashed assets are `immutable` and `sw.js` is `no-cache`, but `index.html` falls back to Apache heuristic caching. The service worker mostly hides this after install, but the first visit / SW-bypassed fetches can pin a stale shell. Add `Cache-Control: no-cache` for `index.html`.

- [x] **27. Deploy rsync never prunes old releases** — `.github/workflows/deploy.yml:51`
  Without `--delete`, hashed chunks accumulate forever on the server. Keeping a grace period is actually good for PWAs (open tabs referencing old chunks), but unbounded growth isn't; consider `--delete` plus a scheduled cleanup, or document the retention decision.

- [x] **28. Stats page computes `workSecondsFor`/`baseAmountOf` twice per expense** — `src/pages/StatsPage.vue:62-112`
  `totals` and `categoryStats` independently re-derive the same per-expense values (each of which does an `incomePeriodFor` linear scan). Compute a single `computed` list of `{ expense, base, seconds }` and derive both aggregates from it.
  _Folded into the fix for #5: both aggregates now derive from a single `rows` computed._

## Refactoring suggestions (beyond fixes above)

- [ ] **29. Extract the shared "amount + currency select" and "category select" form fragments** — `ExpenseFormDialog.vue` and `TemplateFormDialog.vue` duplicate ~40 lines of identical Vuetify markup (currency select with subtitle slot, category select with avatar/selection slots). A `CurrencyAmountFields`/`CategorySelect` component pair would keep the two dialogs in lockstep. *(LOW)*

- [ ] **30. Consolidate duplicated snackbar-confirm patterns for destructive actions** — `CategoriesPage.vue`, `TemplatesPage.vue`, `IncomeSettingsCard.vue`, `FxSettingsCard.vue` each hand-roll delete flows; only categories get a confirm dialog and only expenses get undo. Consider one `useConfirm()`/undo pattern so income periods and templates aren't deleted irrevocably on a single mis-tap. *(LOW)*
