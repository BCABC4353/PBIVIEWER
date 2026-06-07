# R5 Pre-Sprint-4 Sweep — Deferred Findings Backlog

> Source: `docs/audit/PRE-SPRINT4-SWEEP.md` (2026-06-07 comprehensive gap sweep, 36 confirmed-new findings, zero new blockers).
> Seven theme-aligned items were folded into Sprint 4 (see `docs/IMPLEMENTATION-PLAN-R5.md` Lane E). The remaining **29** are logged here against their target sprints.

## Hard sequencing constraints (must not be violated)
1. **NEW-AUTH-1 before or with PROD-B1.** The account switcher (PROD-B1, Sprint 6) is *broken-on-arrival* on top of the current `accounts[0]` re-clobber read paths. NEW-AUTH-1 (persisted active-account-by-`homeAccountId` source of truth) is a hard prerequisite.
2. **NEW-DEP-2 before or with the v2.0.0 audit hard-gate.** The default-scope `npm audit` gate is provably unpassable while SEC-S8/S9 dev-tree upgrades are deferred; the `--omit=dev` prod-only split must land with (or before) the gate flip.

---

## Sprint 5 (v1.8.0)
| ID | Title | Sev | File:Line | Notes |
|---|---|---|---|---|
| NEW-SEC-3 | Main-window `will-navigate` allowlist permits `http://localhost` in production | NIT | index.ts:178-182 | Gate localhost branch on `isDev`. |
| NEW-SEC-4 | Webview `src` interpolates unvalidated `appId` route param into Power BI URL | NIT | AppViewer.tsx:130 | Add `UUID_REGEX` check before nav; pairs with ARCH-S6 webview-config work. |
| NEW-AUTH-2 | `isAuthenticated()` re-deserializes cache + overwrites `this.account` every call; non-idempotent `initializeCache` | SHOULD-FIX | auth-service.ts:77-88 | Rides the BEH lane (already owns auth-service.ts). Make read path non-mutating. |
| NEW-AUTH-3 | `validateToken()` 5-min short-circuit trusts `lastKnownExpiry` possibly from a different account | NIT | auth-service.ts:94-115,411-413 | BEH-B2 rider: key `lastKnownExpiry` by `homeAccountId`. |
| NEW-BEH-1 | PresentationMode auto-start makes Pause un-pausable when `autoStartSlideshow` is ON | SHOULD-FIX | PresentationMode.tsx:213-217 | Gate auto-start behind `hasAutoStartedRef`; coordinates with ARCH-S7 decomposition. |
| NEW-BEH-2 | ErrorBoundary "Try Again" cannot recover a deterministic route-level render error | SHOULD-FIX | ErrorBoundary.tsx:40-54 | Add key-bump or navigate on reset; pairs with A11Y-S8 ErrorBoundary work. |
| NEW-PERF-1 | Export-PDF hidden window can hang and orphan a renderer — no load timeout | SHOULD-FIX | index.ts:618-642 | Race a ~30s reject; pairs with NEW-SEC-2 export-window hardening. |
| NEW-A11Y-3 | TitleBar/StatusBar outside any landmark; `<main>` unnamed | SHOULD-FIX | AppShell.tsx:42-64 | banner/contentinfo landmarks + named `<main>`; pairs with NEW-A11Y-2 skip-link (S4). |
| NEW-UX-2 | Report/Dashboard icon type-colors disagree across 4 views; raw `purple-600`/`amber-600` | NIT | SearchDialog.tsx:128,132,134 | Canonical per-type icon-color token map; pairs with UX-S13. |
| NEW-UX-3 | Viewer Refresh buttons lack disabled/in-progress state | NIT | ReportViewer.tsx:533-540 | Interaction-consistency vs Export PDF buttons. |
| NEW-ARCH-1 | PDF-export logic duplicated wholesale ReportViewer↔DashboardViewer (~70 lines) | SHOULD-FIX | ReportViewer.tsx + DashboardViewer.tsx | Extract `useViewerExport`; pairs with ARCH-S2 hook work. |
| NEW-ARCH-2 | Untyped IPC-to-embed event contract (`event: any`) | NIT | usePowerBIEmbed.ts:13,323,344 | Typed `EmbedEvent<T>` via `service.ICustomEvent<T>`; pairs with ARCH-S2. |
| NEW-PROD-4 | Freshness timestamp uses kiosk local TZ, no TZ label, 2-digit year | NIT | ReportViewer.tsx:498-506 | PBI returns UTC; misconfigured appliance clock shifts displayed time. |
| NEW-PROD-5 | Stale recent/frequent tiles for deleted reports → unrecoverable error, no self-heal | SHOULD-FIX | HomePage.tsx:40-50 | Targeted evict of dead usage entries on 404; pairs with BEH-B3 usage work. |
| NEW-CI-2 | Preload contextBridge boundary (~37 channels) completely untested | SHOULD-FIX | preload/index.ts:8-95 | Channel-map contract test; pairs with ARCH-B4 test revival. |
| NEW-CI-3 | No coverage threshold configured — coverage can silently decay | SHOULD-FIX | vitest.config.ts:18-27 | Add `thresholds` floor + switch CI to `test:coverage`. |
| NEW-CI-5 | `src/test/` orphaned from every tsconfig — setup/sanity never type-checked | SHOULD-FIX | tsconfig.renderer.json:23 | Add `src/test` to a tsconfig; a real TS6133 already hides there. |
| NEW-CI-6 | Workflows have no concurrency control — overlapping tag pushes race the draft release | NIT | build.yml:1-9 | Add `concurrency` group. |
| NEW-CI-7 | `scripts/generate-config.js` never linted or type-checked | NIT | package.json:23 | Extend `eslint src scripts` + Node globals. |
| NEW-DEP-1 | `dotenv` declared as prod dep but never imported (dead prod dep in asar) | NIT | package.json:29 | Remove or move to devDependencies. |

## Sprint 6 (v1.9.0)
| ID | Title | Sev | File:Line | Notes |
|---|---|---|---|---|
| **NEW-AUTH-1** | Multi-account: selected account silently discarded — every read path hard-codes `accounts[0]` | SHOULD-FIX | auth-service.ts:58-61,79-81,386-402 | **HARD PREREQUISITE for PROD-B1.** Persisted active-account-by-`homeAccountId` source of truth. |
| NEW-A11Y-5 | PresentationMode keydown `preventDefault`s Space/Arrows unconditionally — settings Slider unusable by keyboard | SHOULD-FIX | PresentationMode.tsx:366-396 | Bail global handler when `e.target` is an interactive overlay control; pairs with PROD-S1 kiosk. |
| NEW-PROD-1 | "Data refreshed" timestamp leaks across reports (cross-report freshness leak) | SHOULD-FIX | ReportViewer.tsx:31,142-154,523-527 | Reset `lastDataRefresh`/`datasetIdRef` on report param change; pairs with PROD-S9. |
| NEW-PROD-2 | No main-process renderer crash/hang recovery — dead wall display, no auto-reload | SHOULD-FIX | index.ts:132-198,244-273 | `render-process-gone`/`unresponsive` auto-reload; complements PROD-S1 embed-level recovery. |
| NEW-PROD-3 | Freshness timestamp has no staleness threshold — frozen dataset shows old time in neutral grey | SHOULD-FIX | ReportViewer.tsx:497-527 | Escalate visually past refresh interval; pairs with PROD-S9. |

## Sprint 7 (v2.0.0)
| ID | Title | Sev | File:Line | Notes |
|---|---|---|---|---|
| NEW-CI-4 | No smoke/e2e test launches the packaged Electron app | SHOULD-FIX | build.yml:56-68 | `electron .` boot-and-screenshot smoke; pairs with the Electron-30 packaged smoke. |
| **NEW-DEP-2** | Planned `npm audit` hard-gate uses default (dev+prod) scope, not shipped prod-only closure | SHOULD-FIX | build.yml:43 | **Gating dependency for the v2.0 audit hard-gate.** Split into hard `--omit=dev` + report-only full-tree. |

## Backlog (no sprint)
| ID | Title | Sev | File:Line | Notes |
|---|---|---|---|---|
| NEW-CI-8 | macOS package retry loop masks deterministic failures as transient (~30s) | NIT | build.yml:116-128 | ZIP target already designs out hdiutil flakiness; drop retry to 1. Address opportunistically. |
