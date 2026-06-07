# Pre-Sprint-4 Gap Sweep — Power BI Viewer (R5 Plan)

**Date:** 2026-06-07
**Scope:** Ten discipline specialists swept the codebase for anything the 70-finding R5 plan MISSED. Each candidate was adversarially verified for being REAL (confirmed against source) and NOVEL (not covered by any existing R5 task). 51 candidates examined; **36 confirmed new findings**.

---

## Executive verdict

**The R5 plan is substantively complete but NOT exhaustive.** The sweep surfaced **36 genuine, novel gaps** — none of them a BLOCKER. The headline conclusions:

- **Zero new BLOCKERS.** Nothing found breaks the sign-in-once / multi-tenant / kiosk core promise or constitutes a live security/data-loss defect. The plan's blocker inventory holds.
- **15 SHOULD-FIX, 21 NIT.** The SHOULD-FIX set clusters in three areas the plan under-served: **accessibility wayfinding** (skip link, route-focus, landmarks, slideshow announce), **auth multi-account correctness** (the `accounts[0]` re-clobber family — a hard prerequisite for the as-yet-unshipped PROD-B1 account switcher), and **release-engineering rigor** (release pipeline runs no lint/test, preload boundary untested, no coverage floor, no packaged-app smoke test).
- **One latent landmine for a planned feature:** Findings on the `accounts[0]` re-clobber (NEW-AUTH-1/2/3) mean **PROD-B1 (account switcher, Sprint 6) would be broken on arrival** if implemented on top of the current read paths. These must land before or with PROD-B1.
- **Proceed.** None of the 36 blocks Sprint 4. A small a11y/brand/CI cluster is worth pulling INTO Sprint 4 (v1.7.0) because it aligns exactly with the sprint theme; the rest log cleanly to Sprints 5–7.

---

## All 36 confirmed-new findings

Sprint mapping: **S4 = v1.7.0**, **S5 = v1.8.0**, **S6 = v1.9.0**, **S7 = v2.0.0**.

| # | Proposed ID | Title | Dimension | File:Line | Sev | Sprint | One-line rationale |
|---|---|---|---|---|---|---|---|
| 1 | NEW-SEC-1 | Auth window has no `setWindowOpenHandler` — `window.open` from remote MS/CDN content spawns unconstrained child window | security | auth-service.ts:266-372 | SHOULD-FIX | S4 | Auth window loads remote MS content but is excluded from the webview-gated global window-open handler; phishing/escape surface. |
| 2 | NEW-SEC-2 | Export-PDF `data:` window: no CSP, no window-open handler, no nav guard, default nodeIntegration | security | index.ts:589-622 | NIT | S4 | Defense-in-depth only (renders app-controlled content), but the transient window dodges every main-window hardening. |
| 3 | NEW-SEC-3 | Main-window `will-navigate` allowlist permits `http://localhost` in production | security | index.ts:178-182 | NIT | S5 | Localhost branch is dead weight in packaged builds; free hardening to gate on `isDev`. |
| 4 | NEW-SEC-4 | Webview `src` interpolates unvalidated `appId` route param into Power BI URL | security | AppViewer.tsx:130 | NIT | S5 | Only viewer that injects a route param into a live nav target with no `UUID_REGEX` check; blast radius bounded by host allowlist. |
| 5 | NEW-AUTH-1 | Multi-account: selected account silently discarded — every read path hard-codes `accounts[0]` | auth-msal | auth-service.ts:58-61,79-81,386-402 | SHOULD-FIX | S6 | No active-account-by-homeAccountId source of truth; data-segregation defect that makes PROD-B1 broken-on-arrival. |
| 6 | NEW-AUTH-2 | `isAuthenticated()` re-deserializes cache and overwrites `this.account` on every call | auth-msal | auth-service.ts:77-88 | SHOULD-FIX | S5 | Read-path mutation + non-idempotent `initializeCache`; latent multi-account hazard. |
| 7 | NEW-AUTH-3 | `validateToken()` 5-min short-circuit trusts `lastKnownExpiry` from a possibly-different account | auth-msal | auth-service.ts:94-115,411-413 | NIT | S5 | Account-identity dimension of `lastKnownExpiry`; fold into BEH-B2 rider, key expiry by homeAccountId. |
| 8 | NEW-BEH-1 | PresentationMode auto-start effect makes Pause un-pausable when `autoStartSlideshow` is ON | state-behavior | PresentationMode.tsx:213-217 | SHOULD-FIX | S5 | `isPlaying` in deps re-fires the auto-start; opt-in setting cannot pause. Gate behind `hasAutoStartedRef`. |
| 9 | NEW-BEH-2 | ErrorBoundary "Try Again" cannot recover a deterministic route-level render error | state-behavior | ErrorBoundary.tsx:40-54 | SHOULD-FIX | S5 | Reset re-mounts same route/state/hash → re-throws; only "Go Home" escapes. Add key-bump or navigate. |
| 10 | NEW-PERF-1 | Export-PDF hidden window can hang and orphan a renderer — no load timeout | performance-memory | index.ts:618-642 | SHOULD-FIX | S5 | `finally`-only cleanup never runs on a stalled/crashed load; orphans accumulate per re-invoke. Race a ~30s reject. |
| 11 | NEW-A11Y-1 | No focus management on client-side route change (focus stranded, route unannounced) | accessibility | App.tsx:54-138 | SHOULD-FIX | S4 | WCAG 2.4.3 + 4.1.3; move focus to `<h1>`/main and/or add a route announcer. |
| 12 | NEW-A11Y-2 | No skip link to bypass TitleBar + Sidebar | accessibility | AppShell.tsx:41-60 | SHOULD-FIX | S4 | WCAG 2.4.1 Bypass Blocks (A); ~6 controls before content on every page. |
| 13 | NEW-A11Y-3 | TitleBar/StatusBar outside any landmark; `<main>` unnamed | accessibility | AppShell.tsx:42-64 | SHOULD-FIX | S5 | WCAG 1.3.1; search/account/email skipped by SR landmark navigation. |
| 14 | NEW-A11Y-4 | PresentationMode slide changes not announced; counter removed from DOM after 3s | accessibility | PresentationMode.tsx:537-546 | SHOULD-FIX | S4 | WCAG 4.1.3; add persistent visually-hidden `aria-live="polite"` slide announcer. |
| 15 | NEW-A11Y-5 | PresentationMode keydown `preventDefault`s Space/Arrows unconditionally — settings Slider unusable by keyboard | accessibility | PresentationMode.tsx:366-396 | SHOULD-FIX | S6 | WCAG 2.1.1; bail global handler when `e.target` is an interactive overlay control. |
| 16 | NEW-A11Y-6 | Search-launcher button lacks `aria-haspopup="dialog"` | accessibility | TitleBar.tsx:68-78 | NIT | S6 | WCAG 4.1.2 hint; A11Y-B3 covers the avatar menu only, not this button. |
| 17 | NEW-UX-1 | Tailwind `/opacity` on `var()`-based status colors drops the background — error/warning tints render transparent | ux-ui | tailwind.config.js:30-33 | SHOULD-FIX | S4 | Verified by compiling: `bg-status-error/10` emits NO rule; 4 surfaces lose their tint. Define tokens as `rgb(var() / <alpha-value>)`. |
| 18 | NEW-UX-2 | Report/Dashboard icon type-colors disagree across 4 views; raw `purple-600`/`amber-600` non-token colors | ux-ui | SearchDialog.tsx:128,132,134 | NIT | S5 | Cosmetic drift; needs one canonical per-type icon-color token map. |
| 19 | NEW-UX-3 | Viewer Refresh buttons lack disabled/in-progress state | ux-ui | ReportViewer.tsx:533-540 | NIT | S5 | Interaction-consistency gap vs Export PDF buttons; refresh is idempotent. |
| 20 | NEW-ARCH-1 | PDF-export logic duplicated wholesale between ReportViewer and DashboardViewer (~70 lines) | architecture | ReportViewer.tsx + DashboardViewer.tsx | SHOULD-FIX | S5 | Byte-identical `showExportStatus`/timeout/capture flow; extract `useViewerExport`. |
| 21 | NEW-ARCH-2 | Untyped IPC-to-embed event contract: `EmbedEventHandlers` and handlers all `event: any` | architecture | usePowerBIEmbed.ts:13,323,344 | NIT | S5 | `service.ICustomEvent<T>` exists; typed `EmbedEvent<T>` catches payload drift at compile time. |
| 22 | NEW-PROD-1 | "Data refreshed" timestamp leaks across reports — mis-signals freshness on a wall display | product-kiosk | ReportViewer.tsx:31,142-154,523-527 | SHOULD-FIX | S6 | `lastDataRefresh`/`datasetIdRef` never reset on param change; Report B shows Report A's time. |
| 23 | NEW-PROD-2 | No main-process renderer crash/hang recovery — dead wall display, no auto-reload | product-kiosk | index.ts:132-198,244-273 | SHOULD-FIX | S6 | No `render-process-gone`/`unresponsive` handler; PROD-S1 covers only embed-level recovery. |
| 24 | NEW-PROD-3 | Freshness timestamp has no staleness threshold — frozen dataset shows old time in neutral grey | product-kiosk | ReportViewer.tsx:497-527 | SHOULD-FIX | S6 | Escalate visually (relative + warning color) past the refresh interval. |
| 25 | NEW-PROD-4 | Freshness timestamp uses kiosk local TZ, no TZ label, 2-digit year | product-kiosk | ReportViewer.tsx:498-506 | NIT | S5 | PBI returns UTC; misconfigured appliance clock silently shifts the displayed time. |
| 26 | NEW-PROD-5 | Stale recent/frequent tiles for deleted reports route to an unrecoverable error with no self-heal | product-kiosk | HomePage.tsx:40-50 | SHOULD-FIX | S5 | Primary kiosk launch surface; only prune path is the all-or-nothing "Clear usage history". Add targeted evict. |
| 27 | NEW-CI-1 | Release pipeline (build.yml) runs no tests and no lint before packaging/publishing | testing-ci-build | build.yml:53-57,141-167 | SHOULD-FIX | S4 | Tag-triggered release path has only `tsc`; `git tag && push` can release a red tree. Add lint+test steps. |
| 28 | NEW-CI-2 | Preload contextBridge boundary (`src/preload/index.ts`) completely untested | testing-ci-build | preload/index.ts:8-95 | SHOULD-FIX | S5 | ~37 channels; a wrong channel string / arg reorder compiles but breaks at runtime. Add channel-map test. |
| 29 | NEW-CI-3 | No coverage threshold configured — coverage can silently decay to zero | testing-ci-build | vitest.config.ts:18-27 | SHOULD-FIX | S5 | No `thresholds`; CI runs `vitest run` (no coverage at all). Add floor + switch CI to `test:coverage`. |
| 30 | NEW-CI-4 | No smoke/e2e test ever launches the packaged Electron app | testing-ci-build | build.yml:56-68 | SHOULD-FIX | S7 | Fragile asar relative path-joins invisible to unit tests; add `electron .` boot-and-screenshot smoke. |
| 31 | NEW-CI-5 | `src/test/` orphaned from every tsconfig — setup.ts/sanity.test.tsx never type-checked | testing-ci-build | tsconfig.renderer.json:23 | SHOULD-FIX | S5 | Hand-written ElectronAPI mock can drift; a real TS6133 already hides there. Add `src/test` to a tsconfig. |
| 32 | NEW-CI-6 | Workflows have no concurrency control — overlapping tag pushes race the draft release | testing-ci-build | build.yml:1-9 | NIT | S5 | Add `concurrency` group; impact bounded by `draft: true`. |
| 33 | NEW-CI-7 | `scripts/generate-config.js` is never linted or type-checked | testing-ci-build | package.json:23 | NIT | S5 | Build-critical file outside all static-analysis gates; extend `eslint src scripts` + Node globals. |
| 34 | NEW-CI-8 | macOS package retry loop masks deterministic failures as transient, burns ~30s | testing-ci-build | build.yml:116-128 | NIT | backlog | ZIP target already designs out hdiutil flakiness; drop retry to 1. Outside every defined sprint theme. |
| 35 | NEW-DEP-1 | `dotenv` is a declared prod dependency but never imported (dead prod dep in shipped asar) | dependencies-supplychain | package.json:29 | NIT | S5 | Manual `.env` parse in generate-config doesn't use it; remove or move to devDependencies. |
| 36 | NEW-DEP-2 | Planned `npm audit` hard-gate uses default (dev+prod) scope, not the shipped prod-only closure | dependencies-supplychain | build.yml:43 | SHOULD-FIX | S7 | Verified: default-scope gate is UNPASSABLE (dev-tree HIGH/CRITICAL deferred by SEC-S8/S9); `--omit=dev` passes clean. |

---

## Dimensions with ZERO new findings

**None.** All ten swept dimensions (security, auth-msal, state-behavior, performance-memory, accessibility, ux-ui, architecture, product-kiosk, testing-ci-build, dependencies-supplychain) produced at least one confirmed-new finding. This is a signal that the sweep had broad reach rather than that any dimension was perfectly covered — read together with the verdict, it means the plan is strong but every discipline left at least one real gap on the table. The plan's existing coverage was confirmed dense enough that **every** candidate had to clear an explicit "not covered by an existing task id" bar, and 15 of 51 candidates were rejected as already-covered or not-real.

---

## Recommended plan amendments

### Pull INTO Sprint 4 (v1.7.0) — theme-aligned, low-cost, high-value

The v1.7.0 theme is **Accessibility + Brand Foundation + Perf + Sec fast-lane**. Seven findings land squarely inside that theme and should be added to the existing Sprint 4 lanes rather than deferred:

| ID | Add to lane | Why it belongs in S4 |
|---|---|---|
| **NEW-A11Y-1** (route focus mgmt) | A11Y lane | Core a11y wayfinding; the sprint already touches App/AppShell heading work. |
| **NEW-A11Y-2** (skip link) | A11Y lane | WCAG A Bypass Blocks; trivial visually-hidden-until-focused link in AppShell. |
| **NEW-A11Y-4** (slideshow announce) | A11Y lane | WCAG 4.1.3; one `aria-live` region in PresentationMode. |
| **NEW-UX-1** (transparent status tints) | UX brand lane | Brand/visual correctness; same `tailwind.config.js` the brand ramp edits. Verified broken by compilation. |
| **NEW-SEC-1** (auth window window-open) | SEC fast-lane | Sits beside SEC-S1/S3/S4 already in the fast-lane; one-line `setWindowOpenHandler` on the auth window. |
| **NEW-SEC-2** (export `data:` window) | SEC fast-lane | Same `index.ts` export region; belt-and-suspenders deny handlers + explicit `nodeIntegration:false`. |
| **NEW-CI-1** (release path no lint/test) | CI fast-lane | Prevents shipping the v1.7.0 release tag from a red tree — directly protects the sprint's own deliverable. |

> Net Sprint 4 additions: **2 SEC, 3 A11Y, 1 UX, 1 CI** (7 items; 5 SHOULD-FIX + 2 NIT). All are bounded edits to files the sprint already opens.

### Defer to later sprints (log to backlog now)

- **Sprint 5 (v1.8.0):** NEW-SEC-3, NEW-SEC-4, NEW-AUTH-2, NEW-AUTH-3, NEW-BEH-1, NEW-BEH-2, NEW-PERF-1, NEW-A11Y-3, NEW-UX-2, NEW-UX-3, NEW-ARCH-1, NEW-ARCH-2, NEW-PROD-4, NEW-PROD-5, NEW-CI-2, NEW-CI-3, NEW-CI-5, NEW-CI-6, NEW-CI-7, NEW-DEP-1. (NEW-AUTH-2/3 ride the BEH lane that already owns `auth-service.ts`; NEW-PERF-1 pairs with the export window.)
- **Sprint 6 (v1.9.0):** NEW-AUTH-1, NEW-A11Y-5, NEW-PROD-1, NEW-PROD-2, NEW-PROD-3. **Hard sequencing note:** NEW-AUTH-1 (active-account source of truth) must land **before or with PROD-B1** (account switcher) — PROD-B1 as specified is broken-on-arrival on top of the `accounts[0]` re-clobber.
- **Sprint 7 (v2.0.0):** NEW-CI-4 (packaged-app smoke), NEW-DEP-2 (prod-scoped audit gate). **NEW-DEP-2 is a gating dependency for the planned v2.0 hard audit gate** — the default-scope gate is provably unpassable while SEC-S8/S9 upgrades are deferred, so the `--omit=dev` split should land with (or before) the gate flip.
- **Backlog (no sprint):** NEW-CI-8 (mac retry loop) — real but outside every defined sprint theme; address opportunistically.

---

## Proceed?

**Yes — begin Sprint 4 implementation now.** No new finding is a BLOCKER, and the plan's blocker inventory is intact. Fold the seven theme-aligned items above into the existing Sprint 4 lanes (they touch files the sprint already opens), and log the remaining 29 to the backlog against Sprints 5–7 with the two hard sequencing constraints recorded:

1. **NEW-AUTH-1 before/with PROD-B1** (account switcher would otherwise be broken on arrival).
2. **NEW-DEP-2 before/with the v2.0 hard audit gate** (default-scope gate is unpassable while dev-tree upgrades are deferred).

Sprint 4 gate criteria are unaffected by these additions; the new a11y items strengthen the existing SOFT `accessibility-audit` gate rather than introducing new gate risk.
