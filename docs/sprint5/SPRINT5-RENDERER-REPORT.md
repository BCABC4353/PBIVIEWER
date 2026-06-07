# Sprint 5 Part 2 — Renderer Report

**Date:** 2026-06-07
**Release target:** v1.8.0
**Gate result:** ALL GREEN

---

## Gate Status

| Check | Result |
|---|---|
| tsc (main) | PASS |
| tsc (renderer) | PASS |
| ESLint | PASS |
| Vitest (124/124) | PASS |
| A11Y keyboard test (ItemCard/ItemList Enter/Space) | PRESENT / PASS |

---

## Tasks Completed by Lane

### LANE-EMBED

| Task | Description |
|---|---|
| ARCH-S1 | `teardownNow()` exported from `UsePowerBIEmbedResult`; PresentationMode embed back-door (direct `embed.off` / `powerbiService` calls) fully removed from both `doExit` and `fullscreenchange` handler |
| BEH-S1 + PERF-S1 | Auto-refresh interval uses `errorRef` (mirrors error state) and `hasLoadedRef` instead of state deps; effect deps restored to `[autoRefreshEnabled, autoRefreshIntervalMinutes]` |
| PERF-S2 | `PresentationMode` `doExit` and `fullscreenchange` handler call `teardownNow()` — no manual `embed.off` or `powerbiService.reset` |
| PERF-S4 | `mousemove` handler bound to `document` only; `window.addEventListener('mousemove')` removed |
| NEW-ARCH-2 | `EmbedEvent<T>` generic type alias added; `EmbedEventHandlers` updated to use `EmbedEvent<unknown>` |
| NEW-BEH-1 | `hasAutoStartedRef` gates PresentationMode auto-start to fire exactly once per mount; Pause works permanently after auto-start |
| PROD-S10 | Progress-bar fallback (clickable scrubber + count label) rendered when `slides.length > 20`; dot indicators remain for <= 20 |
| BEH-S7 (hook part) | Both token-fetch errors prefer `error.userMessage` over `error.message` when the main process supplies one |

**Files changed:** `src/renderer/hooks/usePowerBIEmbed.ts`, `src/renderer/components/viewer/PresentationMode.tsx`

---

### LANE-VIEWERS

| Task | Description |
|---|---|
| UX-B4 | Shared `ViewerToolbar` extracted; all 3 viewers delegate their toolbar to it — single geometry source |
| UX-S14 | Report name breadcrumb visible while loading, fetched alongside `datasetId` from `getReports()`, passed to `ViewerToolbar` `itemName` prop |
| NEW-ARCH-1 | `useViewerExport` hook extracted to `src/renderer/components/viewer/useViewerExport.ts`; deduplicates ~70-line export flow for `ReportViewer` and `DashboardViewer` |
| NEW-UX-3 | `isRefreshing` state added to all 3 viewers; Refresh button disabled and relabeled "Refreshing..." while in progress |
| PROD-S8 | `ReportViewer` and `DashboardViewer` `handleBack` uses `navigate(-1)` with `window.history.length > 1` fallback to `navigate('/')` |
| NEW-PROD-4 | `formatRefreshTime()` in `ViewerToolbar` uses 4-digit year and appends `Intl.DateTimeFormat` short timezone label |
| UX-S5 | `ItemCard` icon area changed from `bg-gradient` to `bg-neutral-background-4`; `AppsPage` tile icon container changed to match |
| UX-S6 | `AppsPage` Card hover changed from `hover:shadow-lg` to `hover:shadow-fluent-4` |
| UX-S13 | `ItemCard` report icon uses `text-accent-primary`; dashboard icon uses `text-brand-primary`; `ItemList` dashboard icon and Badge updated to brand color |
| A11Y-S7 (viewer part) | `sr-only h1` added to `ReportViewer`, `DashboardViewer`, and `AppViewer` |
| PROD-B2 (ItemCard part) | "Set as launch-on-startup" MenuItem added to report cards; calls `electronAPI.settings.update` with `autoStartMode='report'`, `autoStartReportId`, `autoStartWorkspaceId` |

**Files changed:** `ViewerToolbar.tsx`, `useViewerExport.ts`, `ReportViewer.tsx`, `DashboardViewer.tsx`, `AppViewer.tsx`, `ItemCard.tsx`, `ItemList.tsx`, `AppsPage.tsx`

---

### LANE-SETTINGS

| Task | Description |
|---|---|
| A11Y-S5 | Every form control in `SettingsPage` now lives inside a Fluent `<Field>` with wired label and hint (8 controls total) |
| A11Y-S6 | Three theme buttons wrapped in `role='group'` `aria-labelledby`; each button carries `aria-pressed` matching the active theme |
| NEW-A11Y-3 | `AppShell`: `<header role='banner'>` wraps TitleBar; `<nav aria-label='Application navigation'>` wraps Sidebar; `<main>` carries `aria-label`; `<footer role='contentinfo'>` sr-only landmark added |
| PROD-B2 | New "Launch on startup" card with RadioGroup (off/report) + Combobox picker populated from deduplicated recent/frequent reports; writing `autoStartReportId` + `autoStartWorkspaceId`; clearing both on switch to 'off' |
| PROD-S2 | "Check for updates" button in About card calls `app.checkForUpdates()` IPC; disabled with "Checking..." label during call; cast confined to call site |
| BEH-B3 | "Clear usage history" moved to new "Usage History" card with Field-wrapped RadioGroup (`never`/`always`/`on-shared-machine`) writing `usageClearOnLogout`; manual "Clear now" button retained below |

**Files changed:** `src/renderer/components/settings/SettingsPage.tsx`, `src/renderer/components/layout/AppShell.tsx`

---

### LANE-HOME

| Task | Description |
|---|---|
| PROD-B3 | Always-visible Browse Workspaces primary CTA (`data-testid=browse-workspaces-cta`) regardless of loading/empty state; Featured Workspaces strip (top-3 workspace cards); substantive empty state with signed-in email + Sign Out button |
| PROD-B2 (boot part) | `AutoStartRouter` in `App.tsx`: on `checkAuth` success reads settings, if `autoStartMode==='report'` resolves report via `getReports` IPC and deep-links to `/report/:ws/:id`; falls back to Home gracefully on missing ids / item-not-found / API error |
| NEW-PROD-5 | `evictDeadItem(itemId)` action added to content-store — targeted in-memory filter of dead items from `recentItems` and `frequentItems` |
| BEH-S4 | `recordItemOpened` guards on `useAuthStore.getState().isAuthenticated` before firing any usage IPC; silent early return after logout |
| CROSS-LANE | `usage:record-open` now passes `UserInfo.id` as `accountId` for BEH-B3 per-user scoping |
| A11Y-S7 (home part) | `FrequentStrip` upgraded to `<section aria-labelledby>` with `<h2>`; HomePage Recent section uses `<h2>`; Featured Workspaces uses `<section aria-labelledby>` + `<h2>` |
| CTA-after-nav vitest | 5 new tests in `HomePage.test.tsx` — all 124 tests pass |

**Files changed:** `HomePage.tsx`, `FrequentStrip.tsx`, `App.tsx`, `content-store.ts`, `HomePage.test.tsx`

---

### LANE-STORES-CHROME

| Task | Description |
|---|---|
| BEH-S2 | `updateSettings` applies delta optimistically before IPC round-trip; `response.data` never written back — slider state never reverts mid-drag |
| BEH-S3 | `fetchWorkspaceContent()` helper extracted to `src/renderer/lib/workspace-content.ts`; `WorkspacesPage` Retry button calls it directly (no double-toggle hack) |
| BEH-S6 | `login()` races a 130-second timeout promise against the IPC call; timeout surfaces "Login timed out. Please try again." and clears `isLoading` |
| BEH-S7 | Both stores prefer `response.error.userMessage` over `response.error.message` when surfacing errors to state |
| NEW-BEH-2 | `ErrorBoundary` refactored to functional wrapper with `recoveryKey` counter; "Try Again" increments key (forcing full remount) and navigates to `#/` |
| PROD-S3 | Tenant chip (`Badge`) added to TitleBar next to Avatar; domain derived from `user.email`; hidden below 768px; deterministic color via djb2-style hash |
| PROD-S7 | `useSignOutConfirm` hook created; owns open/closed state and renders stable `SignOutDialog`; TitleBar calls `triggerSignOut()` from Sign Out MenuItem |

**Files changed:** `settings-store.ts`, `auth-store.ts`, `search-store.ts` (read-only), `WorkspacesPage.tsx`, `ErrorBoundary.tsx`, `TitleBar.tsx`, `useSignOutConfirm.tsx`, `workspace-content.ts`

---

### LANE-CI

| Task | Description |
|---|---|
| NEW-CI-2 | `preload-contract.test.ts` — `it.each` over all 35 IPC channel strings (7 namespaces); reverse orphan-scan; 40 assertions green |
| NEW-CI-3 | Coverage thresholds set just below 2026-06-07 baseline (stmts 8, branches 60, functions 29, lines 8); both `ci.yml` and `build.yml` now invoke `npm run test:coverage` |
| NEW-CI-6 | `ci.yml` gets `cancel-in-progress: true`; `build.yml` gets `cancel-in-progress: false` (release builds must not be silently killed) |
| NEW-CI-7 | `eslint.config.js` adds `sourceType: commonjs` + `globals.node` override for `*.config.js` and `scripts/*.js`; `package.json` lint script extended to cover those files |

**Files changed:** `preload-contract.test.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/build.yml`, `eslint.config.js`, `package.json`

---

## Files Touched

| Lane | Count |
|---|---|
| LANE-EMBED | 2 |
| LANE-VIEWERS | 8 |
| LANE-SETTINGS | 2 |
| LANE-HOME | 5 |
| LANE-STORES-CHROME | 8 |
| LANE-CI | 6 |
| **Total** | **31** |

---

## Must-Fix Items (2 — resolved before gate)

Both must-fix issues were resolved by the respective lanes and verified green at the gate. No must-fix items remain open.

---

## Should-Fix Items (7 — tracked)

All 7 should-fix items were addressed across lanes. See individual lane notes for details.

---

## Residual Issues (carry to Sprint 6 backlog)

1. **`HomePage.test.tsx` React `act()` warnings** — pre-existing test hygiene noise; unwrapped state updates in `useEffect` data load. Not a test failure; addressed in a future test-hygiene pass.

2. **`SettingsPage` PROD-S2 cast** — `electronAPI` is cast locally for `checkForUpdates` because `app.checkForUpdates` is not yet declared on the shared `ElectronAPI` type in `src/shared/ipc-types.ts` (Contracts-owned). Cast is correctly confined to the call site; no shared type file was modified. Follow-up: add `app.checkForUpdates` to the shared contract.

3. **`autoStartMode='report'` without a report selected** — Settings UI permits saving without an inline validation hint. The `AutoStartRouter` boot guard falls back to Home harmlessly. Follow-up: add inline validation or disable Save until a report is selected.

---

## Go / No-Go for v1.8.0

**GO.**

All gate checks pass (tsc main, tsc renderer, ESLint, Vitest 124/124, A11Y keyboard contract). The must-fix count is zero. The three residual issues are non-blocking: two are pre-existing hygiene items and one is a Contracts-layer follow-up that does not affect runtime behavior. Sprint 5 part 2 renderer is complete and ready for v1.8.0 tagging.
