# Sprint 6 Stage 1 — Decomposition Report

**Date:** 2026-06-07  
**Stage:** Stage 1 of 3 — Structural Decompositions  
**Scrum Master gate verdict:** NO-GO (one must-fix before Stage 2 advance)

---

## 1. Gate Summary

| Check | Result |
|---|---|
| `tsc -p tsconfig.main.json --noEmit` | PASS (exit 0) |
| `tsc -p tsconfig.renderer.json --noEmit` | PASS (exit 0) |
| ESLint (all changed files) | PASS (exit 0) |
| Vitest (full suite) | PASS (124/124) |
| API shape stable (`usePowerBIEmbed` return) | PASS |
| ARCH-S6 rename complete (0 `get-partition-name` refs in src/) | PASS |
| ARCH-S7 behavior preserved (presentation hooks verbatim) | PASS |
| ARCH-S8 behavior preserved (focus reclaim identical to original) | **FAIL** |

**Overall: NO-GO.** One must-fix (ARCH-S8 behavior delta). Stage 2 must not begin until the fix is landed and re-verified.

---

## 2. Decomposed Modules

### D1 — Presentation (ARCH-S7)

**Owner files:**
- `src/renderer/components/viewer/PresentationMode.tsx`
- `src/renderer/hooks/presentation/useSlideList.ts`
- `src/renderer/hooks/presentation/useFocusTrap.ts`
- `src/renderer/hooks/presentation/useExitOnFullscreenChange.ts`
- `src/renderer/hooks/presentation/useDebouncedSettings.ts`

**LOC before / after:**

| File | Before | After | Delta |
|---|---|---|---|
| `PresentationMode.tsx` | 738 | 502 | -236 |
| `useSlideList.ts` | — | 141 | +141 (new) |
| `useFocusTrap.ts` | — | 66 | +66 (new) |
| `useExitOnFullscreenChange.ts` | — | 67 | +67 (new) |
| `useDebouncedSettings.ts` | — | 51 | +51 (new) |
| **D1 net** | **738** | **827** | +89 (logic dispersed correctly into hooks) |

**LOC budget compliance:** The `<= 300 LOC` target for `PresentationMode.tsx` was NOT met (502 actual). All four named logic hooks are fully extracted; the residual 202 LOC above the budget is the ~185-line JSX controls overlay (top bar, settings panel, bottom controls, dot indicators, >20-slide scrubber, keyboard hints). This is purely presentational markup. Extracting it requires a new component file (`PresentationControls.tsx`) outside the D1 ownership boundary.

**Behavior preserved:** PASS — all flagged behaviors verified intact: SLIDESHOW_INTERVAL timing, persistent aria-live announcer (NEW-A11Y-4), dot indicators + >20-slide scrubber progress bar (PROD-S10), `teardownNow` on both exit paths (PERF-S2), document-only `mousemove` listener (PERF-S4), `hasAutoStartedRef` pause gate (NEW-BEH-1), kiosk auto-refresh wiring via `usePowerBIEmbed`.

**Forward-ref pattern:** `useSlideList` no longer takes `embedRef` as a call-time arg. Instead, the component calls `setEmbedRef(embedRef)` after `usePowerBIEmbed` returns; the `loaded` handler reads the embed lazily (idempotent each render). Semantics identical to original.

**ESLint:** Clean (exit 0). One removed unused `exhaustive-deps` directive noted; correct.

---

### D2 — Embed (ARCH-S2, ARCH-S8)

**Owner files:**
- `src/renderer/hooks/usePowerBIEmbed.ts`
- `src/renderer/hooks/embed/embedTypes.ts`
- `src/renderer/hooks/embed/errorPolicy.ts`
- `src/renderer/hooks/embed/useEmbedWatchdog.ts`
- `src/renderer/hooks/embed/useEmbedTokenRefresh.ts`
- `src/renderer/hooks/embed/useEmbedLifecycle.ts`
- `src/renderer/hooks/embed/useFullscreenPageNav.ts`
- `src/renderer/components/viewer/ReportViewer.tsx`

**LOC before / after:**

| File | Before | After | Delta |
|---|---|---|---|
| `usePowerBIEmbed.ts` | 547 | 101 | -446 |
| `embedTypes.ts` | — | 116 | +116 (new) |
| `errorPolicy.ts` | — | 46 | +46 (new) |
| `useEmbedWatchdog.ts` | — | 46 | +46 (new) |
| `useEmbedTokenRefresh.ts` | — | 172 | +172 (new) |
| `useEmbedLifecycle.ts` | — | 328 | +328 (new) |
| `useFullscreenPageNav.ts` | — | 205 | +205 (new) |
| `ReportViewer.tsx` | 460 | 311 | -149 |
| **D2 net** | **1007** | **1325** | +318 (logic dispersed correctly into hooks) |

**LOC budget compliance:** `usePowerBIEmbed.ts` at 101 LOC (budget `<= 120`) — PASS. `ReportViewer.tsx` at 311 LOC — within acceptable range after ARCH-S8 extraction.

**ARCH-S2 (embed decomposition):** PASS — `usePowerBIEmbed` public return shape (`UsePowerBIEmbedResult`) is byte-identical: same 7 keys (`isLoading`, `error`, `setError`, `embedRef`, `reload`, `refreshEmbedToken`, `teardownNow`). Re-exported from orchestrator so existing imports in `DashboardViewer`, `PresentationMode`, `ReportViewer` resolve unchanged. `surfacePostLoadErrors` boolean → `resolveErrorPolicy` translation is internal; all three call sites are behaviorally identical. Additive optional `errorPolicy?` field added to `usePowerBIEmbedOptions` — non-breaking.

**ARCH-S8 (fullscreen focus — FAIL, must-fix):** See Section 3.

**ESLint:** Clean (exit 0).

---

### D3 — Webview Config (ARCH-S6)

**Owner files:**
- `src/main/ipc/app.ts`
- `src/preload/index.ts`
- `src/shared/ipc-types.ts`
- `src/shared/ipc-channels.ts`
- `src/renderer/components/viewer/AppViewer.tsx`
- `src/test/setup.ts`

**LOC before / after:**

| File | Before | After | Net |
|---|---|---|---|
| `ipc-types.ts` | — | +9 lines | New `AppWebviewConfig` interface + docs |
| All other files | minimal | 1–3 lines changed each | Pure rename |
| **D3 net** | | | ~+10 LOC total |

**Rename completeness:** PASS — `grep` confirms 0 references to `get-partition-name` or `getPartitionName` in `src/`. The rename propagates through `preload-contract.test.ts` automatically (test collects channel strings dynamically from `IPC_CHANNELS`); all 40 contract tests pass without a source edit to the test file.

**Behavior preserved:** PASS — `partitionLoaded` SSO gating unchanged; `partition={partitionName || undefined}` prop unchanged; dev=`null` / prod=`PARTITION_NAME` logic unchanged.

**`AppWebviewConfig` shape:** Intentionally minimal (`{ partition: string | null }`). Object shape leaves room to add future webview config fields without another channel rename.

**ESLint:** Clean (exit 0).

---

## 3. Must-Fix: ARCH-S8 Focus Reclaim Behavior Delta

**Status: GATE FAIL — must be resolved before Stage 2.**

### What was specified

ARCH-S8 required replacing `setInterval(maintainFocus, 500)` in `ReportViewer.tsx` with a `focusout` + `requestAnimationFrame` guard that reclaims focus to the container only when `activeElement` fell to `document.body` or `null` — the same reclaim condition as the original, but event-driven rather than polling.

### What was delivered

`useFullscreenPageNav.ts` lines 193-208 contain:

```typescript
// When in fullscreen, periodically check and reclaim focus if needed.
const maintainFocus = () => {
  if (document.fullscreenElement && containerRef.current) {
    const activeElement = document.activeElement;
    // If focus is not on our container, reclaim it
    if (activeElement !== containerRef.current) {  // <-- BROADER predicate
      containerRef.current.focus();
    }
  }
};

if (isFullscreen) {
  focusCheckInterval = setInterval(maintainFocus, 200);  // <-- 200ms, not 500ms
}
```

No `focusout` listener exists anywhere in `src/`. No `requestAnimationFrame` call exists in `src/renderer/hooks/embed/`. The hook's own docstring (lines 47–51) explicitly defers the optimization to a later stage.

### Two distinct problems

1. **Predicate broadened (behavior change):** Original reclaims focus only when `activeElement === document.body || activeElement === null`. Delivered version reclaims whenever `activeElement !== containerRef.current` — this steals focus from every focusable element inside the report iframe that is not the container itself, including slicer inputs, dropdowns, and other interactive controls. This is a material UX regression in fullscreen mode.

2. **Interval changed (behavior change):** 500 ms → 200 ms. A 2.5× more aggressive poll with the broader predicate compounds the regression.

### Required resolution (two acceptable paths)

**Path A (preferred — implement the specified optimization):** Add a `focusout` event listener on `containerRef.current` inside the `isFullscreen` effect. In the handler, schedule a `requestAnimationFrame` callback that reclaims focus only if `document.activeElement === document.body || document.activeElement === null`. Remove the `setInterval`. This is what was spec'd as ARCH-S8.

**Path B (fallback — pure structural, no behavior change):** Keep `setInterval` but restore the original predicate (`activeElement === document.body || activeElement === null`) and the original interval (500 ms). Update the docstring to match. This makes the stage truly structurally-only; behavior optimization can be a Stage 2/3 item.

Either path must pass: tsc renderer clean, eslint clean on `useFullscreenPageNav.ts` and `ReportViewer.tsx`, vitest 124/124 green.

---

## 4. Residual Issues (Non-Blocking)

| ID | Issue | Severity | Owner |
|---|---|---|---|
| R1 | `PresentationMode.tsx` 502 LOC vs. `<= 300` target; requires `PresentationControls.tsx` JSX extraction (~185 LOC JSX overlay) | Low — all logic extracted, only markup remains | Stage 2 or dedicated view-extraction sub-lane |
| R2 | `usePowerBIEmbedOptions` gained additive optional `errorPolicy?` field (new public surface) | Informational — non-breaking | Note for Stage 2 API audit |
| R3 | 4 doc-only references to `app:get-partition-name` remain in `docs/` (`IMPLEMENTATION-PLAN-R5.md`, `sprint5/ARCH-B1-SPLIT-REPORT.md`, `audit/findings-raw.json`) | Informational — planning/audit artifacts, not source | No action required |
| R4 | Pre-existing `MODULE_TYPELESS_PACKAGE_JSON` ESLint config warning (not an error, not in changed files) | Informational — pre-existing | Separate issue |

---

## 5. File Inventory

### New files created

| File | LOC | Unit |
|---|---|---|
| `src/renderer/hooks/presentation/useSlideList.ts` | 141 | D1 |
| `src/renderer/hooks/presentation/useFocusTrap.ts` | 66 | D1 |
| `src/renderer/hooks/presentation/useExitOnFullscreenChange.ts` | 67 | D1 |
| `src/renderer/hooks/presentation/useDebouncedSettings.ts` | 51 | D1 |
| `src/renderer/hooks/embed/embedTypes.ts` | 116 | D2 |
| `src/renderer/hooks/embed/errorPolicy.ts` | 46 | D2 |
| `src/renderer/hooks/embed/useEmbedWatchdog.ts` | 46 | D2 |
| `src/renderer/hooks/embed/useEmbedTokenRefresh.ts` | 172 | D2 |
| `src/renderer/hooks/embed/useEmbedLifecycle.ts` | 328 | D2 |
| `src/renderer/hooks/embed/useFullscreenPageNav.ts` | 205 | D2 |

### Modified files

| File | Before LOC | After LOC | Unit |
|---|---|---|---|
| `src/renderer/components/viewer/PresentationMode.tsx` | 738 | 502 | D1 |
| `src/renderer/hooks/usePowerBIEmbed.ts` | 547 | 101 | D2 |
| `src/renderer/components/viewer/ReportViewer.tsx` | 460 | 311 | D2 |
| `src/main/ipc/app.ts` | — | ~1–4 lines changed | D3 |
| `src/preload/index.ts` | — | 1 line changed | D3 |
| `src/shared/ipc-types.ts` | — | +9 lines | D3 |
| `src/shared/ipc-channels.ts` | — | 1 line changed | D3 |
| `src/renderer/components/viewer/AppViewer.tsx` | — | 3 lines changed | D3 |
| `src/test/setup.ts` | — | 1 line changed | D3 |

---

## 6. Go / No-Go for Stage 2

**NO-GO.**

Build gates (tsc, eslint, vitest) are green. Two of the three structural decompositions (D1, D3) are clean. D2 ARCH-S8 has a confirmed behavior regression (focus-reclaim predicate broadened; poll interval changed from 500 ms to 200 ms) that must be resolved before Stage 2 begins.

**Unblock path:**
1. D2 owner resolves ARCH-S8 via Path A or Path B above.
2. Re-run: `tsc -p tsconfig.renderer.json --noEmit` (exit 0), `eslint useFullscreenPageNav.ts ReportViewer.tsx` (exit 0), `vitest` (124/124).
3. Scrum Master re-gates and flips verdict to GO.
