# Power BI Viewer — Performance & Memory Audit

> Dimension 10 of the production-readiness teardown (re-run after an agent-type error in the original workflow). Scope: Electron 28 + React 18 viewer, 20-user Monday rollout, heavy open/close cycling. Read-only audit.

## CRITICAL

### 1. `powerbi-client` embeds are `reset()` but never `report.off(...)` — listener + iframe leak per report open
- **id:** `pbi-embed-not-destroyed`
- On every report load, `loadReport` registers 13 `report.on(...)` handlers (`ReportViewer.tsx:386,428,442,460,464,468,472,476,480,484,488,492`) plus `loaded`/`error`. Cleanup only calls `powerbiService.reset(container)` (`ReportViewer.tsx:92`) — which removes the iframe but does **not** detach handlers. The `Embed` object and its closures (capturing component scope) stay referenced by the singleton service (`usePowerBIService.ts:4`). Same in `DashboardViewer.tsx:179-199`, `PresentationMode.tsx:471-514`.
- **Impact:** 40 reports opened in an hour → 40 leaked report graphs + 40×13 closures. Heap climbs; sluggish/ OOM risk on weaker machines mid-session.
- **Fix:** keep registered event names in an array; in cleanup `try { names.forEach(n => reportRef.current?.off(n)) } finally { powerbiService.reset(container) }`. Also drop the 9 debug handlers (#7).

### 2. 200ms focus-reclaim interval steals focus from the iframe 5×/sec in fullscreen
- **id:** `focus-reclaim-interval-thrash`
- `setInterval(maintainFocus, 200)` (`ReportViewer.tsx:300-302`) calls `embedContainerRef.focus()` whenever focus isn't on the container — fighting the Power BI iframe. Clicking into a slicer/dropdown gets yanked back within 200ms.
- **Impact:** In fullscreen (wall-display use case), in-report interaction feels broken: "slicers don't work," "dropdown closes itself." Plus 5Hz layout recalc. Interval *is* cleared on cleanup — this is thrash, not a leak.
- **Fix:** replace polling with a `focusout` listener that refocuses only when `document.activeElement === document.body`; or scope refocus to keydown handling. At minimum raise to 1–2s.

## HIGH
- **3. `webview-not-torn-down`** — `AppViewer` `<webview>` never `.stop()`/`src='about:blank'` on unmount (`AppViewer.tsx:182-196`, cleanup `:86-91`). Each app view spawns a full PBI-SPA renderer (200–400MB). Fix: stop + blank src in cleanup.
- **4. `getallitems-fanout-scaling`** — search enumerates every report+dashboard in every workspace (`powerbi-api.ts:497-553`) on first keystroke (`search-store.ts:101-110`). 300 workspaces → 600 paginated calls in batches of 5. Fix: server-side search or lazy/background pre-warm; bounded pool; 429 handling.
- **5. `search-cache-module-global`** — `searchCache`/`currentSearchId` are module-level globals holding the whole tenant content list, never evicted, survive logout (`search-store.ts:24-33`); `invalidateCache` is dead. Fix: move into store / clear on logout.
- **6. `record-item-double-refetch`** — every open `await`s recordOpen + sequential recent + frequent reload before navigating (`content-store.ts:123-138`, callers `WorkspacesPage.tsx:133,145`). ~100–400ms added to the hot path. Fix: fire-and-forget; `Promise.all` the reloads.

## MEDIUM
- **7. `debug-logging-on-hot-events`** — 9 `console.log` handlers incl. `visualRendered` (per-visual-per-render) ship to prod (`ReportViewer.tsx:442-494`). Delete; keep loaded/error/pageChanged and don't re-`getPages()` on pageChanged.
- **8. `inline-prop-literals-rerenders`** — fresh `icon={<X/>}`, inline closures, `slides.map` rebuilt every render; `mousemove`→`setShowControls` re-renders whole overlay continuously during presentation (`PresentationMode.tsx:391-401,662-672`). Fix: throttle mousemove, gate setState on change, memoize icons, memo the overlay.
- **9. `aggressive-autorefresh-default`** — 1-minute `report.refresh()` default per open report (`ReportViewer.tsx:33`, `PresentationMode.tsx:66`). 20 users → ~20 dataset refreshes/min + per-minute flicker. Fix: default 10–15 min; only refresh when `lastRefreshTime` advanced.
- **10. `settings-refetch-per-mount`** — `settings.get()` IPC on every viewer mount + `getReports` re-paginates a workspace just to find one `datasetId` (`ReportViewer.tsx:60-73,334-340`). Fix: read from settings-store; get datasetId from content-store.

## LOW
- **11. `non-virtualized-lists`** — `WorkspacesPage` renders all items per expanded workspace (`:247-282`). Virtualize >100.
- **12. `content-store-maps-unbounded`** — `reports`/`dashboards` Maps never evict (`content-store.ts:11-12`); duplicate of search cache. Share one cache.
- **13. `presentation-effect-churn`** — mousemove bound to **both** window+document (`PresentationMode.tsx:407-408`) → double fire. Attach once. (All timer/listener cleanups otherwise correct.)

## Verdict
Two items bite 20 users within an hour: **#1 (handler-detach heap creep)** and **#2 (focus-steal breaks fullscreen interaction)**. Next tier: **#3/#4/#5** (large-tenant / shared-machine). Notably, all `setInterval`/`setTimeout`/listener cleanups for auto-refresh, slideshow, visibilitychange, fullscreenchange, keydown, export-status *are* present and paired — the leaks are specifically PBI handler detachment (#1) and webview teardown (#3).
