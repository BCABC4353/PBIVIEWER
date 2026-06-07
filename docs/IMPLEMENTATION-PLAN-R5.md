# Power BI Viewer — Implementation Plan v2 (Round 5: Audit Closure)

> **Status:** Draft, antagonist-corrected. Not yet executed.
> **Branch of record:** `sprint0-hardening` at v1.6.1, tree clean.
> **Prior rounds:** Sprints 0–3 documented in `docs/IMPLEMENTATION-PLAN.md`; this plan covers Sprints 4–7.
> **Distribution model:** unchanged — manual GitHub Releases, no auto-update, no code-signing. **Owner pushes, tags, and publishes manually. Scrum Master asks before every `git push`, `git tag`, and `gh release` operation.**
> **Round-5 inputs:** synthesis of the 6-lane antagonist sweep (UX, Architecture, Security, Behavior/State, Performance, Accessibility, Product) — ~70 findings, ~20 blockers.

---

## 1. Executive Summary

Round 5 turns the **functional** tool you have at v1.6.1 into a **kiosk-grade, multi-tenant product** for 20 non-technical users. Three structural changes carry the round: (a) **multi-domain identity is fixed end-to-end** — partition sign-in/sign-out symmetry, per-user usage scoping, and an in-app account switcher so the multi-O365 mission stops requiring a 4-click logout dance; (b) **the wall-display use case becomes first-class** — `autoStartReportId` wiring, kiosk mode (`powerSaveBlocker`, slideshow auto-recovery, optional keyboard-lock, cursor-hide), and the autoRefresh default finally drops from 1 min to 10 min; (c) **accessibility moves from WCAG 2.1 AA grade D to B** — 6 blockers + ~15 polish items remediated under an auditable exit gate. Underneath: an architecture reset (split the 767-LOC `main/index.ts` into eight `main/ipc/*.ts` domain modules, consolidate validation, decouple Zustand stores, refactor auth/api to factory+DI so the two skipped tests finally run) so Round 6 ships features instead of fighting debt. The Electron 28→30 LTS bump and remaining major-dep upgrades are isolated to a dedicated Sprint 7 / v2.0.0 with a canary cohort and explicit rollback plan — the most-cited security item is sequenced last because it's the riskiest, not least important.

**Outcome at v2.0.0:** a signed-once, kiosk-survivable, AA-accessible, structurally clean app on Electron 30 LTS with a working regression net.

---

## 2. Release Plan

> Dates are relative to round-5 kickoff (T+0). Each release exits on **HARD (exit-0 command)** + **SOFT (human-confirmed)** gates. HARD = `tsc && eslint --max-warnings=0 && vitest run` + topical greps + applicable tool skills. SOFT = owner runs the listed manual checks on the packaged build.

### v1.7.0 — Accessibility, Brand, Perf Hotfix — **T+5d** (Sprint 4)
**Theme:** Stop the bleeding. Visible, high-impact fixes that don't depend on the architecture refactor.
**Scope:** A11Y blockers (B1–B6); UX brand foundation + 3 UX blockers (B1 titlebar token, B2 LoginScreen brand, B3 LoginScreen real TitleBar); SEC fast lane (S1 will-attach-webview, S3 export-path narrow, S4 lastKnownExpiry clear on InteractionRequiredAuthError); **PERF-B1 (autoRefresh 1→10 min)** as a direct one-line constant edit (decoupled from ARCH-S10).
**Out of scope:** ARCH refactor; account switcher; kiosk mode; Electron 30.

**HARD gate:** tsc + eslint + vitest clean; `ui-design:accessibility-audit` reports 0 WCAG A blockers across the 6 target sites; grep assertions for the perf constant and `role="alert"` presence.
**SOFT gate:** NVDA pass on LoginScreen / 3 error overlays / SearchDialog combobox / ItemCard keyboard activation; visual screenshot diff confirming brand-orange `appearance="primary"` everywhere; owner-confirmed install on a clean machine.

### v1.8.0 — Auth Correctness + Auto-Start + Architecture Reset — **T+10d from Sprint 4 start** (Sprint 5)
**Theme:** Pay down the structural debt and fix multi-domain auth end-to-end. The largest sprint.
**Scope:** BEH blockers (B1 partition symmetry, B2 validateToken honesty, B3 per-user usage); PROD-B2 `autoStartReportId` wiring; PROD-B3 first-install Home; ARCH bedrock (B1 main/ipc split, B2 validation consolidation, B4 factory/DI for tests); UX-B4 ViewerToolbar (3 viewers; PresentationMode deferred to Sprint 6 as UX-B4b); UX Sprint 5 cluster (S4 max-width rule, S5 card unification, S6 shadow scale, S13 type-color, S14 ReportViewer breadcrumb); auxiliary BEH/PERF tasks single-owned through coordinated files; A11Y SettingsPage Field migration (S5).
**Out of scope:** Account switcher (waits one sprint after BEH-B1 stabilizes); kiosk epic; Electron 30.

**HARD gate:** tsc + eslint + vitest clean; `wc -l src/main/index.ts` ≤ 150; both previously-skipped tests now running with non-trivial assertions; `architect-review` agent on the merged diff has no circular-import findings.
**SOFT gate:** two-tenant smoke (user A → sign out → user B → recent items show only B's, partition cookie inspector confirms session gone); restart-after-setting-autoStart lands on the chosen item; refactor smoke (no regression in any v1.7 gate).

### v1.9.0 — Account Switcher + Kiosk Mode + A11y Polish — **T+15d from Sprint 4 start** (Sprint 6)
**Theme:** Ship the headline product features. Earn the kiosk badge.
**Scope:** PROD-B1 in-app account switcher; PROD-S1 kiosk mode epic (powerSaveBlocker IPC, slideshow auto-recovery with 5/30/60s backoff, optional 3s-Esc-hold or Ctrl+Shift+Esc, cursor-hide); PROD-S6 AppViewer nested-webview Refresh; PROD-S9 Dashboard data-freshness; ARCH-B3 Zustand inversion via subscribe-based `evict-on-logout.ts`; ARCH-S2 hook decomposition (`useEmbedLifecycle`/`Token`/`Watchdog` + errorPolicy); ARCH-S7 PresentationMode decomposition (`useSlideList`/`useFocusTrap`/`useDebouncedSettings`); ARCH-S8 `useFullscreenPageNav` + focusout+rAF replacing 500ms setInterval; ARCH-S6 `app:get-app-webview-config`; UX-B4b PresentationMode toolbar; A11Y polish (S1–S4, S6–S15, ~15 items).
**Out of scope:** Electron 30; major dep bumps.

**HARD gate:** tsc + eslint + vitest clean; `ui-design:accessibility-audit` returns WCAG 2.1 AA grade ≥ B across all routes; `application-performance:performance-optimization` profile shows 30-min cycling with no monotonic heap growth and log file under cap.
**SOFT gate:** owner runs 30-min unattended kiosk soak on a real display (powerSaveBlocker active, induced network blip recovers via slideshow auto-recovery); account-switch end-to-end on two real tenants in under 4 clicks; NVDA full-app pass at WCAG B.

### v2.0.0 — Electron 30 LTS + Bookkeeping — **T+25d from Sprint 4 start, owner-blocked** (Sprint 7)
**Theme:** Major-version cleanup. **Do not start until v1.9.0 is stable in the field for 48h on a pilot machine.**
**Scope:** **SEC-S2 Electron 28.3.3 → 30 LTS** (closes 17 high-severity CVEs); SEC-S5 partition session storage clear extended (`localstorage`/`indexdb`/`serviceworkers`/`cachestorage`); ARCH polish (N1–N7: empty folders, void embedRef cleanup, azure-config gitignore verification, clearInvalidConfig logging, SearchDialog mount pattern, root CLAUDE.md, userMessage required); UX-D1 `docs/UI_PATTERNS.md`; UX-D2 regression grep sweep; release-notes consolidation; doc archival of Sprints 4–6.
**Out of scope:** msal-node v5 (Sprint 8+), electron-builder 26 (Sprint 8+), vite 8 (Sprint 8+) — all tracked in `docs/backlog/deferred-upgrades.md`.

**HARD gate:** tsc + eslint + vitest clean; `npm audit --audit-level=high` shows the 17 prior CVEs gone; `npm ls electron` → 30.x; full Playwright `_electron` smoke green; `/security-review` zero new high/critical on the merged diff.
**SOFT gate:** **canary cohort** (2–3 named users on 2 tenants) installs v2.0.0 from the GitHub Release and runs 5 business days without regression vs v1.9.0 baseline; owner confirms `dist/rollback/Power BI Viewer-1.9.0-Windows-Setup.exe` is preserved and the rollback procedure (uninstall v2.0.0, reinstall v1.9.0) is documented in the CHANGELOG.

### Rollback infrastructure (round-5-wide)
- **Pre-bump tag:** before SEC-S2 lands, tag the current tip as `v1.9.0-electron28-fallback`. Cherry-pickable revert target.
- **Pre-split tag:** before ARCH-B1 lands, tag the current tip as `v1.7.0-pre-arch-split`. Cherry-pickable revert if the main/ipc split surfaces unexpected regressions during Sprint 5 SOFT gates.
- **Rollback installer:** preserve the v1.9.0 Windows installer in the v2.0.0 release notes as the documented downgrade path.

---

## 3. Epics

| Epic | Priority | Findings rolled up | Releases |
|---|---|---|---|
| **EPIC-A11Y-D-TO-B** | P0 | A11Y-B1..B6 + S1..S15 + ErrorBoundary + reduced-motion | v1.7.0, v1.9.0 |
| **EPIC-BRAND-FOUNDATION** | P0 | UX-F1 brand ramp, UX-B1 titlebar, UX-B2 login button, UX-B3 LoginScreen real TitleBar | v1.7.0 |
| **EPIC-PERF-HOTFIX** | P0 | PERF-B1 autoRefresh default 1→10 min (decoupled, one-line) | v1.7.0 |
| **EPIC-SEC-FAST-LANE** | P0 | SEC-S1 will-attach-webview, SEC-S3 export path, SEC-S4 lastKnownExpiry | v1.7.0 |
| **EPIC-MULTI-DOMAIN-AUTH** | P0 | BEH-B1 partition symmetry, BEH-B2 validateToken honesty, BEH-B3 per-user usage, PROD-B1 account switcher | v1.8.0, v1.9.0 |
| **EPIC-KIOSK-LAUNCH** | P0 | PROD-B2 autoStartReportId wiring, PROD-B3 first-install Home, PROD-S1 kiosk mode epic | v1.8.0, v1.9.0 |
| **EPIC-MAIN-ARCH-RESET** | P0 | ARCH-B1 index.ts split, ARCH-B2 validation consolidation, ARCH-B4 factory/DI, ARCH-S3/S4/S5/S6/S10 | v1.8.0, v1.9.0 |
| **EPIC-EMBED-LIFECYCLE-V2** | P1 | ARCH-S1 teardownNow, ARCH-S2 hook decomposition, ARCH-S7 PresentationMode decomposition, ARCH-S8 useFullscreenPageNav, BEH-S1/S7, PERF-S1/S2 | v1.8.0, v1.9.0 |
| **EPIC-UX-TOKEN-UNIFICATION** | P1 | UX-S2/S3/S4/S5/S6/S7/S8/S9/S10/S13/S14 + UX-B4 + UX-B4b PresentationMode | v1.7.0, v1.8.0, v1.9.0 |
| **EPIC-STATE-CORRECTNESS-V2** | P1 | BEH-S2/S3/S4/S5/S6, PROD-S4 (merged into BEH-B3), ARCH-B3 Zustand inversion | v1.8.0, v1.9.0 |
| **EPIC-PRODUCT-DISCOVERY-POLISH** | P2 | PROD-S2 Check for updates, PROD-S3 avatar tenant chip, PROD-S5 Pinned/Favorites, PROD-S6 AppViewer nested webview, PROD-S7 sign-out confirmation, PROD-S8 ReportViewer Back, PROD-S9 Dashboard freshness, PROD-S10 slide progress bar | v1.8.0, v1.9.0 |
| **EPIC-ELECTRON-LTS-BUMP** | P1 | SEC-S2 Electron 28→30, SEC-S5 partition storage clear extended, SEC-S6 defaultSession TODO | v2.0.0 |
| **EPIC-CODE-HYGIENE-V2** | P2 | ARCH-N1..N7, doc archival, CLAUDE.md root doc, UX-D1/D2 | v2.0.0 |
| **EPIC-DEFERRED-UPGRADES** | P3 | SEC-S7 msal-node v5, SEC-S8 electron-builder 26, SEC-S9 vite 8 | Sprint 8+ (backlog) |

---

## 4. Sprint Breakdown

> **Effort key:** XS ≤1h · S 1–3h · M 3–6h · L 1–1.5d · XL >1.5d.
> **Single-owner-per-file rule (round-5 specific):**
> - `src/main/index.ts` → UX (Sprint 4 for titlebar IPC) → ARCH (Sprint 5 for split) — disjoint regions, but coordinate.
> - `src/main/auth/auth-service.ts` → BEH lead (Sprint 5: B1+B2+SEC-S4 all bundled); ARCH-B4 lands after as separate diff dependsOn BEH-B1; PROD-B1 (Sprint 6) lands on the post-refactor file.
> - `src/main/ipc/*.ts` (post-Sprint 5) → one owner per file.
> - `src/renderer/hooks/usePowerBIEmbed.ts` → BEH lead (Sprint 5 owns BEH-S1+S7+PERF-S1+PERF-S2 review).
> - `src/renderer/components/layout/TitleBar.tsx` → UX (Sprint 4 lands UX-B1 + A11Y-B3 together) → PROD (Sprint 5+6: S3+S7+B1).
> - `src/renderer/components/viewer/PresentationMode.tsx` → small-tasks owner Sprint 5 (PROD-S10 + A11Y-S11 + PERF-S4) → ARCH-S7 owner Sprint 6 (lands first) → PROD-S1 kiosk owner Sprint 6 (lands on decomposed file).
> - `src/renderer/components/settings/SettingsPage.tsx` → PROD lead Sprint 5 (B2+S2+S7+A11Y-S5+A11Y-S6 in one PR).
> - `src/renderer/components/home/ItemCard.tsx` + `ItemList.tsx` → A11Y lead Sprint 4 (B4+B5); UX-S5 Sprint 5 **dependsOn A11Y-B5** with mandatory vitest keyboard case.

> **Definition of Done labeling:** every task carries HARD (exit-0) + SOFT (human-confirmed) gates explicitly. `comprehensive-review:full-review`, `/security-review`, and `ui-design:accessibility-audit` are SOFT gates (their output is structured prose, not exit-0). HARD gates are always `tsc --noEmit && eslint src --max-warnings=0 && npm run test`.

---

### SPRINT 4 — Accessibility + Brand Foundation + Perf Hotfix (drives v1.7.0)
**Goal:** ship the 6 a11y blockers, the 3 UX brand blockers, the perf hotfix, and the 3 SEC fast-lane items. No architecture refactor, no Electron bump.
**Duration:** 5 days (T+0 → T+5d).
**Concurrent lanes:**

#### Lane A — UX brand foundation (single owner across UX-F1, UX-B1, UX-B2, UX-B3 + Sprint 4 polish)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **UX-F1** | Brand ramp from #FF5F15 (Day 1 — blocks UX-B1/B2/S2/S3/S7) | S | NEW `src/renderer/theme/brandRamp.ts`, `main.tsx` | tsc; lint; grep `webLightTheme`/`webDarkTheme` returns 0 hits in `main.tsx` | screenshot `appearance="primary"` button = #FF5F15-derived in both themes |
| **UX-B1** | Titlebar overlay reads Fluent token at runtime | XS | `main/index.ts:147-148`, `main.tsx:57-70`, `TitleBar.tsx:53` | grep `#1f1f1f`/`#f5f5f5` returns 0 hits in main.ts; tsc; lint | screenshot: no seam between custom titlebar and overlay strip in dark+light modes |
| **UX-B2** | Drop hardcoded MS-blue from LoginScreen button | XS | `LoginScreen.tsx:74` | grep `#0078d4` in LoginScreen returns 0 hits | LoginScreen primary button = brand orange |
| **UX-B3** | LoginScreen uses real TitleBar (`variant="unauthenticated"`) | S | `TitleBar.tsx`, `LoginScreen.tsx:30-35` | tsc; lint | pixel-compare top 40px of Login vs post-login titlebars |
| **UX-S2** | Focus ring → `var(--colorStrokeFocus2)` | XS | `globals.css:78-81` | grep `#0078d4` in globals.css = 0 hits | tab through Home, focus ring brand color in both themes |
| **UX-S3** | Remove `!important` Slider overrides | XS | `globals.css:45-75` | grep `!important.*Slider` = 0 hits | slider visible in both themes |
| **UX-S7** | Sidebar active state: brand-orange + 3px left bar | XS | `Sidebar.tsx:42-56` | tsc; lint | active item visible at >4% luminance contrast |
| **UX-S8** | Sidebar collapse toggle icon swap | XS | `Sidebar.tsx:15-16,89-94` | tsc; lint | collapsed-state icon visibly different from expanded |
| **UX-S9** | Delete StatusBar | XS | DELETE `StatusBar.tsx`, EDIT `AppShell.tsx` | grep `StatusBar` returns 0 hits | content area gains 24px |
| **UX-S10** | SearchDialog `!important` removal + `.kbd-hint` utility | S | `SearchDialog.tsx:157`, `TitleBar.tsx:75-77`, `globals.css` | grep `!important` in SearchDialog = 0 hits | kbd styling identical between TitleBar Ctrl+K and dialog footer |

#### Lane B — A11y blockers (4 sub-agents fanned out per blocker)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **A11Y-B1** | LoginScreen MessageBar wrapped in `role="alert" aria-live="assertive"` | XS | `LoginScreen.tsx:57-64` | grep `role="alert"` present | NVDA announces sign-in failure within 1s |
| **A11Y-B2** | `role="alert"` on Dashboard/AppViewer/Presentation error overlays | XS | `DashboardViewer.tsx:237`, `AppViewer.tsx:176`, `PresentationMode.tsx:509` | grep `role="alert"` in all 3 files | NVDA announces error on each viewer |
| **A11Y-B3** | TitleBar avatar aria-label + aria-haspopup | XS | `TitleBar.tsx:87-94` | grep `aria-label.*Account menu` | NVDA: "Account menu for {name}, menu pop-up" |
| **A11Y-B4** | aria-label on icon-only Buttons (Sidebar/Dashboard/AppViewer/ItemCard/ItemList kebabs) | S | 5 files | axe-core button-name = 0 violations | NVDA reads purpose of each button |
| **A11Y-B5** | ItemCard + ItemList TableRow keyboard-operable (Enter/Space + stopPropagation on kebab) | M | `ItemCard.tsx`, `ItemList.tsx` | vitest case asserts Enter/Space activate card; tsc; lint | keyboard tab through Home, open a card with Enter |
| **A11Y-B6** | SearchDialog combobox ARIA on inner `<input>` via Fluent input slot + sr-only DialogTitle | S | `SearchDialog.tsx:156-186` | DOM inspection: inner input has role=combobox + aria-expanded; tsc | NVDA: "Search Power BI content, combobox, expanded, N results" |

#### Lane C — SEC fast lane (single owner; parallel with Lanes A/B)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **SEC-S1** | `will-attach-webview` defense-in-depth on partition session | S | `main/index.ts` (web-contents-created block) | grep `will-attach-webview`; tsc | dev-mode test: webview with bad src is blocked |
| **SEC-S3** | Drop `os.homedir()` from export path allowlist | XS | `main/index.ts:42-53` | grep `os.homedir` in allowedRoots = 0 hits | DevTools: write to `%USERPROFILE%\AppData\…` rejected |
| **SEC-S4** | Clear `lastKnownExpiry` on `InteractionRequiredAuthError` early-return | XS | `auth-service.ts:421-431` | grep `this.lastKnownExpiry = null` in InteractionRequired branch | unit test: branch nulls expiry |

#### Lane D — Performance hotfix (single one-line edit, decoupled per antagonist)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **PERF-B1** | autoRefreshInterval default 1 → 10 min (direct constant edit, no ARCH-S10 dependency) | XS | `constants.ts:25`, `usePowerBIEmbed.ts:73` (hook default), `main/index.ts:107` clamp | grep `autoRefreshInterval: 10` in DEFAULT_SETTINGS; tsc | open a report in a fresh install → interval = 10 min in Settings |

#### Lane E — Pre-sprint sweep additions (folded in 2026-06-07; see `docs/audit/PRE-SPRINT4-SWEEP.md`)
> Seven theme-aligned findings from the comprehensive gap sweep (36 confirmed-new, zero new blockers). Each is a bounded edit to a file the sprint already opens. The 29 deferred findings live in `docs/backlog/R5-SWEEP-BACKLOG.md`.
| id | title | sev | files | owner group | DoD |
|---|---|---|---|---|---|
| **NEW-UX-1** | Tailwind `/opacity` on `var()`-based status colors emits no rule → error/warning tints render transparent. Redefine as `rgb(var(--x) / <alpha-value>)`. | SHOULD-FIX | `tailwind.config.js`, `globals.css` | Foundation | compiled CSS for `bg-status-error/10` emits a rule |
| **NEW-A11Y-1** | No focus management on client-side route change (WCAG 2.4.3/4.1.3). Move focus to main + route announcer. | SHOULD-FIX | `App.tsx` | Group 3 (shell) | route announced; focus moves to main on nav |
| **NEW-A11Y-2** | No skip link to bypass TitleBar+Sidebar (WCAG 2.4.1 level A). | SHOULD-FIX | `AppShell.tsx` | Group 3 (shell) | Tab from load → "Skip to content" → main |
| **NEW-A11Y-4** | PresentationMode slide changes not announced; counter leaves DOM after 3s (WCAG 4.1.3). Persistent `aria-live` announcer. | SHOULD-FIX | `PresentationMode.tsx` | Group 4 (viewers) | NVDA announces "Slide N of M" on advance |
| **NEW-SEC-1** | Auth window has no `setWindowOpenHandler` — `window.open` from remote MS/CDN content spawns unconstrained child window. | SHOULD-FIX | `auth-service.ts` | Group 6 (main) | deny handler in openAuthWindow |
| **NEW-SEC-2** | Export-PDF `data:` window: no CSP/nav guard/window-open handler, default nodeIntegration. | NIT | `index.ts` | Group 6 (main) | `nodeIntegration:false` + deny handlers on export window |
| **NEW-CI-1** | Release pipeline (`build.yml`) runs no lint/test before packaging — can release a red tree. | SHOULD-FIX | `.github/workflows/build.yml` | Group 7 (CI) | lint+test steps before package step |

**Sprint 4 owner-group map (single-owner-per-file; Foundation lands FIRST, then Groups 2–7 fan out in parallel on disjoint files):**
- **Foundation (lands first, alone):** `tailwind.config.js`, NEW `src/renderer/theme/brandRamp.ts`, `main.tsx`, `globals.css`, `src/shared/constants.ts` → UX-F1, UX-S2, UX-S3, NEW-UX-1, `.kbd-hint` utility, `TITLE_BAR_COLORS` contract, PERF-B1 constants default, titlebar-overlay theme caller.
- **Group 2 — Auth chrome:** `LoginScreen.tsx`, `TitleBar.tsx`, `SearchDialog.tsx` → UX-B2, UX-B3, UX-B1 (TitleBar bg), UX-S10, A11Y-B1, A11Y-B3, A11Y-B4 (titlebar btns), A11Y-B6.
- **Group 3 — Shell:** `AppShell.tsx`, `Sidebar.tsx`, `App.tsx`, DELETE `StatusBar.tsx` → UX-S7, UX-S8, UX-S9, NEW-A11Y-1, NEW-A11Y-2, A11Y-B4 (sidebar btns).
- **Group 4 — Viewers a11y:** `DashboardViewer.tsx`, `AppViewer.tsx`, `PresentationMode.tsx` → A11Y-B2, A11Y-B4 (viewer btns), NEW-A11Y-4. (No PresentationMode decomposition — that's Sprint 6.)
- **Group 5 — Home items:** `ItemCard.tsx`, `ItemList.tsx` → A11Y-B4 (kebab), A11Y-B5 (keyboard + vitest case).
- **Group 6 — Main+perf:** `index.ts`, `preload/index.ts`, `auth-service.ts`, `auth-service.test.ts`, `usePowerBIEmbed.ts` → SEC-S1, SEC-S3, SEC-S4, NEW-SEC-1, NEW-SEC-2, UX-B1 (overlay IPC handler + remove hardcoded hex), PERF-B1 (hook default + clamp).
- **Group 7 — CI:** `.github/workflows/build.yml` → NEW-CI-1.

> Cross-group contracts (all consumed read-only; defined by Foundation in `src/shared/constants.ts`): `TITLE_BAR_COLORS`, brand themes from `brandRamp.ts`, `.kbd-hint` class. Titlebar-overlay IPC contract: renderer `electronAPI.setTitleBarOverlay({color,symbolColor})` → channel `window:set-title-bar-overlay` → main `BrowserWindow.setTitleBarOverlay`. Type references resolve at the central HARD gate, not per-agent.

**Sprint 4 exit gate:**
- HARD: tsc both projects; `eslint src --max-warnings=0`; `vitest run` all green; topical greps above all pass.
- SOFT: `ui-design:accessibility-audit` on the 6 a11y blocker target files reports 0 WCAG A blockers; `comprehensive-review:full-review` (SOFT) on the merged Sprint 4 diff shows no new high/critical; owner installs the v1.7.0 build from a CI tag and confirms titlebar matches, sign-in works, Tab through Home opens a card.
- **Owner gate before any push/tag/release.**

---

### SPRINT 5 — Auth Correctness + AutoStart + Architecture Reset (drives v1.8.0)
**Goal:** the 3 BEH blockers, PROD-B2 + PROD-B3, the 4 ARCH blockers, UX-B4 (3 viewers), the Sprint 5 UX cluster, A11Y SettingsPage Field migration. Largest sprint.
**Duration:** 10 days (T+5d → T+10d from Sprint 4 start, i.e. T+15d absolute).
**Concurrent lanes (after ARCH-B1 lands solo on Day 1):**

#### Day 1 — ARCH-B1 lands solo (no concurrent main-process work)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **ARCH-B1** | Split `src/main/index.ts` (767 → ≤150 LOC) into `main/security.ts`, `main/window.ts`, `main/services/export-service.ts`, `main/ipc/{auth,content,settings,usage,window,export,app,log}.ts`, `main/ipc/register.ts` | XL | 10 new files, `index.ts` shrink | `wc -l src/main/index.ts` ≤ 150; every prior `ipcMain.handle` channel still registered (grep both sides); tsc; lint; vitest | manual smoke: app launches; one IPC call per domain succeeds; **pre-split tag `v1.7.0-pre-arch-split` exists** |

#### Days 2–10 — fan out
**Lane A — Architecture & DI (single owner across files, post-B1):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **ARCH-B2** | Consolidate validation into `src/shared/validation.ts` (UUID_REGEX, NAME_MAX, validateUUID, capName, `validateAppSettingsPatch` returning `{sanitized, rejected}`) | M | NEW `src/shared/validation.ts`, `main/ipc/settings.ts`, `main/ipc/usage.ts`, `settings-service.ts`, `usage-tracking-service.ts` | grep `UUID_REGEX`/`NAME_MAX` returns one definition each; grep `JSON.parse`/`typeof` ad-hoc checks in IPC handlers = 0; tsc; vitest unit tests for new validators | manual: invalid theme value via DevTools returns VALIDATION_FAILED |
| **ARCH-B4** | Factory + DI: `createAuthService(deps)`, `createPowerBIApiService(deps)`, `singleton.ts`; revive 2 skipped tests | L | `auth-service.ts`, `powerbi-api.ts`, NEW `singleton.ts` files, test files | both prior `.skip` removed; vitest coverage on `auth-service` ≥ 60%, on `powerbi-api` ≥ 50%; tsc | manual smoke: login + list workspaces still works |
| **ARCH-S1** | Expose `teardownNow()` from `usePowerBIEmbed`; PresentationMode kiosk back-door removed | S | `usePowerBIEmbed.ts`, `PresentationMode.tsx` | grep `embed.off`/`powerbiService` in PresentationMode = 0 hits; tsc | manual: enter+exit presentation cleanly, no orphan iframe |
| **ARCH-S3** | Move `IPCResponse`+`TokenResult` to `ipc-types.ts`; rename `types.ts` → `domain-types.ts`; delete `lastAccessed` dead field | M | many import sites | tsc; grep `lastAccessed` = 0 hits | manual smoke unchanged |
| **ARCH-S4** | Rename `shared/utils.ts` → `shared/powerbi-errors.ts` | S | rename + update imports | tsc | n/a |
| **ARCH-S5** | IPC channel name map `src/shared/ipc-channels.ts`; delete dead `content:get-recent` | M | preload + main/ipc | grep `'content:get-recent'` = 0 hits; tsc | manual smoke unchanged |
| **ARCH-S10** | Magic numbers consolidated into `constants.ts` groups (NETWORK/TOKEN/EMBED/CACHE/USAGE/POWERBI_API/AUTH) | M | `constants.ts` + ~6 consumer files | grep literals returns only constants file; tsc | manual smoke |

**Lane B — Behavior/Auth (single owner `auth-service.ts`; SEC-S4 already shipped Sprint 4):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **BEH-B1 + BEH-B2 (bundled)** | Partition cookie symmetry (sequential await, fail-loud, pre-login proactive sweep, `reusedPreviousAccount` flag in `AuthResult`) + token-cache corruption: `tokenCache.onCorruption(cb)` registration + `auth-service.invalidateCache()` | M | `auth-service.ts`, `token-cache.ts`, `shared/types.ts` (AuthResult) | grep `Promise.allSettled` removed from logout path; tsc; vitest unit test: forced corruption → validateToken returns `data:false` | manual two-tenant smoke: sign in A → sign out → sign in B → no auto-SSO, no leaked usage |
| **BEH-B3 (PROD-S4 merged in)** | Per-user usage scoping by `homeAccountId`; new setting `usageClearOnLogout: 'always'\|'never'\|'on-shared-machine'` (default `'never'`); logout chain calls `usageTrackingService.clearUsageDataForAccount`; **pre-migration backup** to `usage.pre-v1.7.0.bak.json` + log count + CHANGELOG entry | L | `usage-tracking-service.ts`, `main/ipc/usage.ts`, `shared/types.ts`, `settings-service.ts`, `SettingsPage.tsx` (PROD lead surfaces) | grep `accountId` in UsageRecord; tsc; vitest: migration drops + backs up; setting clamped | manual: backup file exists; usage scoped correctly after switch |

**Lane C — Product (auto-start + Home; settings UI surfacing for BEH-B3):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **PROD-B2** | `autoStartReportId` + `autoStartMode` + `autoStartWorkspaceId` typed → SettingsPage "Launch on startup" Card with item picker (recent ∪ frequent) → `App.tsx` checkAuth-success deep-link guard → ItemCard "Set as auto-launch" menu items | L | `types.ts`, `constants.ts`, `main/ipc/settings.ts` validators, `SettingsPage.tsx`, `App.tsx`, `ItemCard.tsx` | tsc; vitest unit test for boot routing logic | manual: configure → restart → lands on chosen report; misconfig (deleted item) → graceful fallback to Home |
| **PROD-B3** | HomePage: always-visible "Browse Workspaces" CTA; Featured Workspaces strip (top 3 alphabetical); substantive empty-state with signed-in email + Switch account button (Sprint 6) / Sign out (Sprint 5 fallback) | M | `HomePage.tsx`, `content-store.ts` (parallel Promise.all on mount) | **vitest case "CTA visible after navigate cycle"**; tsc | manual: fresh install → welcome; open one item → CTA still visible; force empty workspaces+apps → substantive empty state |

**Lane D — UX (B4 ViewerToolbar + Sprint 5 cluster):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **UX-B4** | ViewerToolbar extracted; ReportViewer/Dashboard/AppViewer migrated (PresentationMode explicitly DEFERRED to Sprint 6 UX-B4b) | M | NEW `ViewerToolbar.tsx` + 3 viewer migrations | grep `h-12 bg-neutral-background-2 border-b` returns 1 hit (component); tsc | manual: 3 viewer toolbars geometry identical |
| **UX-S4** | Page max-width rule documented + applied | XS | NEW `docs/UI_PATTERNS.md` | grep audit | n/a |
| **UX-S5** (dependsOn **A11Y-B5**) | ItemCard / AppCard one shared `ContentCard` (flat, no gradient); migrate AppsPage tiles | S | `ItemCard.tsx`, `AppsPage.tsx:119-130` | **vitest keyboard-activation case preserved**; grep `bg-gradient` in apps = 0 hits | manual visual check |
| **UX-S6** | Shadow scale unification (`shadow-fluent-*` everywhere) | XS | grep+edit | grep `shadow-(sm\|md\|lg\|xl\|2xl)` in components = 0 hits | n/a |
| **UX-S13** | `type-report` / `type-dashboard` tokens (stop using `status-success` for Dashboard icons) | S | `tailwind.config.js`, ItemList/WorkspacesPage/SearchDialog | grep `status-success` for Dashboard contexts = 0 hits | visual check |
| **UX-S14** | ReportViewer breadcrumb (fold into UX-B4 ReportViewer migration) | S | `ReportViewer.tsx` | tsc | report name visible while loading |

**Lane E — A11Y SettingsPage Fluent Field migration (largest single A11Y task):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **A11Y-S5** | All Settings form controls wrapped in Fluent `<Field>` | M | `SettingsPage.tsx` | tsc; axe-core 0 form-label violations in SettingsPage | NVDA walkthrough of Settings: each control announced with label + value |
| **A11Y-S6** | Theme buttons → role="group" + aria-pressed | XS | `SettingsPage.tsx:128-150` | tsc | NVDA: "Theme group: Light pressed" |
| **A11Y-S7** | Heading hierarchy (h2 promotions on HomePage Frequent/Recent; sr-only h1 in viewers) | M | 4 viewer files, HomePage, FrequentStrip | axe-core heading-order 0 violations | NVDA H-key navigation works |

**Lane F — Behavior coordination (single owner on `usePowerBIEmbed.ts`):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **BEH-S1 + PERF-S1 (bundled)** | Auto-refresh interval uses errorRef/hasLoadedRef instead of deps; restored to `[autoRefreshEnabled, autoRefreshIntervalMinutes]` | S | `usePowerBIEmbed.ts` | tsc; vitest stability harness | manual: rapid error toggle doesn't recreate interval |
| **PERF-S2** (dependsOn **ARCH-S1**) | PresentationMode uses `teardownNow()`; manual `embed.off` removed | S | `usePowerBIEmbed.ts`, `PresentationMode.tsx` | grep `embed.off` in PresentationMode = 0 hits; tsc | manual: enter/exit presentation clean |
| **PERF-S3** | electron-log `maxSize=5MB` + `archiveLog` single-old retention + onError rate-limit (1s floor + suppressed-count summary) | S | `main/index.ts` | grep `maxSize`/`archiveLog` present; tsc | manual: log file under 5MB after stress test |
| **PERF-S4** | PresentationMode mousemove: drop `window` binding, keep `document` | XS | `PresentationMode.tsx` | grep mousemove listener count = 1 | manual: controls show/hide still works |
| **BEH-S2** | settings-store `updateSettings` drops `response.data` write (optimistic-authoritative) | XS | `settings-store.ts` | tsc | manual: slider drag never reverts |
| **BEH-S3** | `fetchWorkspaceContent` helper + WorkspacesPage Retry uses single refetch action | S | NEW `src/renderer/lib/workspace-content.ts`, `WorkspacesPage.tsx` | tsc | manual: retry on both-failed expand works |
| **BEH-S4** | `recordItemOpened` auth-check before IPC | XS | `content-store.ts` | tsc | manual: open + logout quickly → no usage IPC error |
| **BEH-S5** | AppViewer `online` retry + visible `loadAppDetails` failure | S | `AppViewer.tsx` | tsc | manual offline→online → auto-retry |
| **BEH-S6** | auth-store login `Promise.race` 130s timeout | XS | `auth-store.ts` | tsc | manual: stub main → isLoading resets after 130s |
| **BEH-S7** (last in lane) | userMessage preference in usePowerBIEmbed/content-store/auth-store/settings-store | S | 4 files | grep `error.userMessage` chain pattern present | manual: 403 shows friendly text |

**Lane G — Product polish (Sprint 5 PROD-S items):**
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **PROD-S2** | Settings → Check for updates button + optional anonymous startup version check | S | `SettingsPage.tsx`, `main/ipc/app.ts` | tsc; vitest unit for version-tuple compare | manual: button opens releases page |
| **PROD-S3** | TitleBar avatar tenant chip + optional deterministic color hash (single owner with PROD-B1 prep) | S | `TitleBar.tsx` | tsc | tenant suffix visible at ≥768px |
| **PROD-S7** | Sign-out confirmation Dialog hook (shared between TitleBar + SettingsPage) | S | NEW `useSignOutConfirm.tsx`, `TitleBar.tsx`, `SettingsPage.tsx` | tsc | manual: both entry points show dialog |
| **PROD-S8** | ReportViewer Back `navigate(-1)` with history-length fallback | XS | `ReportViewer.tsx` | tsc | manual: from search → report → Back returns to search |
| **PROD-S10** | Slide-indicator progress bar fallback for >20 slides (lands BEFORE PROD-S1 epic) | XS | `PresentationMode.tsx` | tsc | manual: 25-page report shows progress bar |

**Sprint 5 exit gate:**
- HARD: tsc + eslint + vitest clean; `wc -l src/main/index.ts` ≤ 150; both previously-skipped tests now active with non-trivial assertions; CI build green; `architect-review` agent (SOFT) on merged diff reports no circular imports.
- SOFT: two-tenant smoke; autoStart smoke; refactor-no-regression vs v1.7 gates; `comprehensive-review:full-review` (SOFT) zero high/critical; **pre-split tag `v1.7.0-pre-arch-split` preserved**; ARCH-B1 1-week soak on the split before Sprint 6 starts piling on (run during early Sprint 6 lane setup, not blocking Sprint 6 kickoff entirely — concurrent with planning).
- **Owner gate before any push/tag/release.**

---

### SPRINT 6 — Account Switcher + Kiosk Mode + A11y Polish (drives v1.9.0)
**Goal:** PROD-B1 account switcher (depends on BEH-B1), PROD-S1 kiosk mode epic, ARCH-S2 hook decomposition (after BEH-S1/PERF-S1 are stable in v1.8), ARCH-S7 PresentationMode decomposition (precondition for PROD-S1), UX-B4b PresentationMode toolbar, the A11Y polish sweep.
**Duration:** 5 days (T+10d → T+15d from Sprint 4 start, i.e. T+20d absolute).

#### Lane A — PresentationMode reset (precondition lane; lands first)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **ARCH-S7** | PresentationMode decomposition (`useSlideList`, `useFocusTrap`, `useExitOnFullscreenChange`, `useDebouncedSettings`); `wc -l` ≤ 300 | L | new hook files + PresentationMode.tsx | `wc -l PresentationMode.tsx` ≤ 300; tsc | manual: presentation flow unchanged |
| **ARCH-S2** (after BEH-S1 stable from v1.8) | Hook decomposition: `useEmbedLifecycle`/`useEmbedTokenRefresh`/`useEmbedWatchdog`; `errorPolicy` strategy replaces `surfacePostLoadErrors` boolean | L | NEW `hooks/embed/*` files, `usePowerBIEmbed.ts` ≤ 120 LOC | tsc; each new file ≤ 200 LOC; vitest passes | manual: token refresh + watchdog still work |
| **ARCH-S8** | `useFullscreenPageNav` extraction; replace `setInterval(maintainFocus, 500)` with focusout+rAF guard | M | NEW `hooks/embed/useFullscreenPageNav.ts`, `ReportViewer.tsx` | grep `setInterval` in ReportViewer = 0 | manual: fullscreen arrow-key page nav + slicer clicks both work |
| **ARCH-S6** | Replace `app:get-partition-name` with `app:get-app-webview-config` | S | `main/ipc/app.ts`, `preload`, `AppViewer.tsx` | tsc; grep old name = 0 | manual: App webview SSO still works |

#### Lane B — Account switcher + kiosk epic (single PresentationMode owner; lands after Lane A)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **PROD-B1** | In-app account switcher: `auth:switch-account` IPC = `logout()` + `login(prompt=select_account)`; TitleBar Menu item; renderer-side replicates login success + content/search/usage store reset; LOGIN_CANCELLED falls back to LoginScreen | M | `auth-service.ts`, `main/ipc/auth.ts`, `preload`, `auth-store.ts`, `TitleBar.tsx` | **vitest unit test: after switch-account, content+search+usage stores reset, lastKnownExpiry cleared, partition cookies cleared**; tsc | **owner SOFT: two-tenant switch on packaged build under 4 clicks, sign-off in PR** |
| **PROD-S1** | Kiosk mode epic: `kioskMode` setting; `window:start-power-save-blocker` / `stop-power-save-blocker` IPC; slideshow auto-recovery with backoff [5s, 30s, 60s]; optional Esc-hold 3s OR Ctrl+Shift+Esc chord; cursor-hide after 3s idle | XL | `types.ts`, `constants.ts`, `main/ipc/window.ts`, `preload`, `PresentationMode.tsx`, `SettingsPage.tsx` | **vitest: backoff schedule called at 5/30/60s on induced error**; tsc; eslint | **owner SOFT: 30-min unattended kiosk soak on a real display; powerSaveBlocker active; one induced network blip recovers** |
| **PROD-S6** | AppViewer `did-navigate` URL tracking + canGoBack Back-in-app button | S | `AppViewer.tsx` | tsc | manual: navigate inside App → Back works |
| **PROD-S9** | Dashboard data-freshness timestamp (mirror ReportViewer pattern) | M | `DashboardViewer.tsx` | tsc | manual: "Last refreshed" visible |
| **UX-B4b** | PresentationMode toolbar (deferred from UX-B4) | M | `PresentationMode.tsx` | tsc | visual consistency with other viewers |

#### Lane C — A11y polish sweep (3 sub-agents fanned out)
A11Y-S1, S2, S3, S4, S8, S9, S10, S11, S12, S13, S14, S15 — all single-file or single-token edits. Each XS-S.
**Exit gate for Lane C:** `ui-design:accessibility-audit` reports WCAG 2.1 AA grade ≥ B across all routes (SOFT).

#### Lane D — Zustand inversion
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **ARCH-B3** | `evict-on-logout.ts` subscription module; auth-store imports cut | S | NEW `src/renderer/lib/evict-on-logout.ts`, `auth-store.ts`, `App.tsx` | grep `useContentStore`/`useSearchStore` in auth-store = 0 hits | manual: logout → next login fresh stores |

#### Lane E — Behavior residual
- **BEH-B3 logout hook** (3-line follow-up after Sprint 5 BEH-B3 base lands — actually this is in Sprint 5, retained here only if it slipped).

**Sprint 6 exit gate:**
- HARD: tsc + eslint + vitest clean; CI build green; account-switch vitest assertions present.
- SOFT: `ui-design:accessibility-audit` returns WCAG B; 30-min kiosk soak passes on pilot; `/security-review` (SOFT) zero new high/critical on auth/webview diff (Lane B touches both); `comprehensive-review:full-review` (SOFT) zero blockers.
- **Owner gate before any push/tag/release.**

---

### SPRINT 7 — Electron 30 LTS + Bookkeeping (drives v2.0.0)
**Goal:** Electron 30 LTS upgrade; SEC-S5 storage clear extension; ARCH polish nits; documentation consolidation; canary rollout.
**Duration:** 10 days (T+15d → T+25d from Sprint 4 start; **gated on 48h field stability of v1.9.0 on a pilot machine**).

#### Lane A — Electron 30 LTS bump (dedicated lane; sole main-process work)
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **SEC-S2 prep** | Context7 fetch of Electron 28→29→30 migration notes (will-attach-webview, webview tag, session.fromPartition, webRequest.onHeadersReceived, BrowserWindow.titleBarOverlay, setWindowOpenHandler, electron-log compat, MSAL compat, electron-builder 24 metadata for Electron 30) | XS | `docs/sprint7/electron-30-migration-notes.md` | doc exists with breakage matrix | n/a |
| **SEC-S2** | Electron 28.3.3 → 30 LTS bump; `npm install`; fix type breakage; tsc clean | XL | `package.json`, `package-lock.json`, possibly `main/index.ts` per Context7 notes | tsc both projects; `npm audit --audit-level=high` shows 17 prior CVEs gone; `npm ls electron` → 30.x | **packaged-build smoke** (install, sign-in, open report, presentation, export PDF, sign-out, sign-in different account, open App); **pre-bump tag `v1.9.0-electron28-fallback` exists**; **rollback installer preserved in `dist/rollback/`**; CHANGELOG documents rollback procedure |

#### Lane B — Security follow-ups
| id | title | effort | files | DoD HARD | DoD SOFT |
|---|---|---|---|---|---|
| **SEC-S5** | Partition session `clearStorageData` extended to `['cookies','localstorage','indexdb','serviceworkers','cachestorage']` (Context7-verify Electron 30 spelling) | S | `auth-service.ts:466-481` | grep new storage list present | manual: logout → sign in second account → second account's reports load (confirms IndexedDB wiped) |
| **SEC-S6** | TODO comment marking `defaultSession` cookie clear for v1.7 removal | XS | `auth-service.ts` | grep `TODO(v1.7)` present | n/a |

#### Lane C — Architecture polish
ARCH-N1 (empty folders), ARCH-N2 (void embedRef), ARCH-N3 (azure-config gitignore verification), ARCH-N4 (clearInvalidConfig logging), ARCH-N5 (SearchDialog mount pattern), ARCH-N6 (root `CLAUDE.md` north-star doc), ARCH-N7 (userMessage required across all error producers — touches contract).

#### Lane D — Product polish residual
**PROD-S5** Pinned/Favorites (XL — UsageRecord.isPinned, new IPC `usage:set-pinned`, PinnedStrip, star toggles on ItemCard/ItemList/WorkspacesPage row).

#### Lane E — Documentation
- **UX-D1** `docs/UI_PATTERNS.md` consolidating brand-ramp, max-width, card vocabulary, LoadingState/EmptyState/ErrorState patterns.
- **UX-D2** Regression grep sweep (`#0078d4`, `!important` in styles, `shadow-(sm|md|lg|xl|2xl)`, `text-status-success` on dashboards, `bg-gradient`, `StatusBar` references, inline `backgroundColor`).
- Archive `docs/sprint{4,5,6}-*.md` to `docs/archive/`.
- Update root `CLAUDE.md` with new main-process layout + validation module + DI factories + hook family.
- Release-notes consolidation: v2.0 changelog covers v1.7→v2.0 arc.

#### Lane F — Backlog documentation
**TOOL-04** equivalent — `docs/backlog/deferred-upgrades.md` with Context7-sourced breakage notes for msal-node v3/v4/v5, electron-builder 26, vite 6/7/8.

**Sprint 7 exit gate (= round-5 final exit gate):**
- HARD: tsc + eslint + vitest clean; `npm audit --audit-level=high` clean; full Playwright `_electron` smoke green; `/security-review` (SOFT but required for v2.0) zero new high/critical on round-5 cumulative diff; CI tag → GitHub Release with all three platform installers attached.
- SOFT: **canary cohort** (2–3 named users on 2 tenants) installs v2.0.0 and runs 5 business days without regression; owner confirms `dist/rollback/Power BI Viewer-1.9.0-Windows-Setup.exe` preserved and rollback procedure documented in v2.0.0 CHANGELOG; `comprehensive-review:full-review` (SOFT) on the round-5 cumulative diff clean; `ui-design:accessibility-audit` re-confirmed at WCAG B.
- **Owner gate before any push/tag/release — and explicit "I have the rollback installer + procedure" sign-off before v2.0.0 fleet rollout.**

---

## 5. Dependency Graph & Parallel Work Streams

**Serialized spine (true dependencies — nothing else waits on these):**
```
Sprint 4:
  Lane A UX-F1 (Day 1) → UX-B1/B2/S2/S3/S7
  Lane B A11Y-B5 → (Sprint 5) UX-S5 (dependsOn A11Y-B5)
  Lane C SEC-S1/S3/S4 (independent, parallel)
  Lane D PERF-B1 (independent, one-line)

Sprint 5:
  Day 1 ARCH-B1 SOLO (no concurrent main-process work) →
    Day 2+ fan out:
      Lane A ARCH-B2/B4/S3/S5/S10 + ARCH-S1
      Lane B BEH-B1+B2 bundled (single auth-service.ts owner) + BEH-B3
      Lane C PROD-B2 + PROD-B3
      Lane D UX-B4 (3 viewers) + S4/S5/S6/S13/S14
      Lane E A11Y-S5/S6/S7 (SettingsPage Field migration)
      Lane F BEH-S1+PERF-S1 bundled + PERF-S2 (dependsOn ARCH-S1) + PERF-S3/S4 + BEH-S2/S3/S4/S5/S6/S7
      Lane G PROD-S2/S3/S7/S8/S10

Sprint 6 (after v1.8 stable):
  Lane A ARCH-S7 PresentationMode decomposition (precondition) → Lane B PROD-S1 kiosk
  Lane A ARCH-S2 (after BEH-S1 stable from v1.8)
  Lane A ARCH-S8 (independent)
  Lane A ARCH-S6 (independent)
  Lane B PROD-B1 (dependsOn BEH-B1 from v1.8)
  Lane B PROD-S6/S9, UX-B4b
  Lane C A11Y-S1..S15 polish sweep
  Lane D ARCH-B3 Zustand inversion (independent)

Sprint 7 (gated on 48h v1.9 field stability):
  Lane A SEC-S2 Electron 30 SOLO main-process bump → Lane B SEC-S5/S6
  Lanes C/D/E/F polish + docs + backlog (parallel)
```

**Swimlanes — what runs CONCURRENTLY (maximum agents in tandem):**

| Sprint | Concurrent lanes |
|---|---|
| Sprint 4 | A (UX brand), B (4 a11y sub-agents fanned out per blocker), C (SEC), D (PERF one-liner) |
| Sprint 5 Day 1 | ARCH-B1 SOLO |
| Sprint 5 Day 2+ | A (arch), B (auth), C (product), D (UX), E (a11y settings), F (behavior coordination), G (product polish) |
| Sprint 6 | A (lifecycle reset) → then B (account switcher + kiosk) in parallel with C (a11y polish) and D (Zustand inversion) |
| Sprint 7 | A (Electron) → then B/C/D/E/F polish in parallel |

**Single-owner-per-file across sprints** (the cross-stream discipline):
- `src/main/index.ts` → UX (Sprint 4 lines 147-148 IPC) / ARCH (Sprint 5 split)
- `src/main/auth/auth-service.ts` → BEH (Sprint 5 single owner for B1+B2+SEC-S4 already shipped) / ARCH-B4 separate diff post-BEH / PROD-B1 (Sprint 6 post-refactor file)
- `src/renderer/hooks/usePowerBIEmbed.ts` → BEH (Sprint 5 single owner for all touching tasks)
- `src/renderer/components/layout/TitleBar.tsx` → UX (Sprint 4: B1 + A11Y-B3) / PROD (Sprint 5 S3+S7) / PROD (Sprint 6 B1)
- `src/renderer/components/viewer/PresentationMode.tsx` → small-tasks owner (Sprint 5: S10 + A11Y-S11 + PERF-S4) / ARCH (Sprint 6 S7 decomposition first) / PROD (Sprint 6 S1 kiosk on decomposed file)
- `src/renderer/components/settings/SettingsPage.tsx` → PROD (Sprint 5: B2+S2+S7+A11Y-S5+A11Y-S6 in one PR)
- `src/renderer/components/home/ItemCard.tsx` + `ItemList.tsx` → A11Y (Sprint 4 B4+B5) / UX (Sprint 5 S5 dependsOn A11Y-B5)

**Agent-team vs fan-out (per global rules):**
- **TeamCreate** ONLY for the Sprint 5 ARCH-B1 main/ipc split convergence gate (architect-review + code-reviewer + typescript-pro cross-check the coupled diff).
- **Workflow / parallel Agent** for everything else with disjoint file ownership.
- **Background Agent** for the Sprint 7 packaged-build smoke (multi-minute build).

---

## 6. Claude Code Tooling Playbook

| Capability | Where used | Why |
|---|---|---|
| **Context7 / `get-library-docs`** | Sprint 4 Day 0: Electron 28 titleBarOverlay (UX-B1) + Fluent BrandVariants (UX-F1). Sprint 7 Day 0: Electron 28→30 migration notes (SEC-S2) + Electron 30 `clearStorageData` storage-key names (SEC-S5). | The exact APIs older agents got wrong (titlebar overlay color, brand-ramp shape, storage-key casing). PHI never crosses the MCP boundary — library names only. |
| **Workflow fan-out + EnterWorktree** | Sprint 4 Lane fan-out (4 concurrent); Sprint 5 post-B1 fan-out (7 concurrent); Sprint 6 fan-out (3 concurrent); Sprint 7 fan-out (5 concurrent post-Electron). | Disjoint-file lanes run in tandem in isolated worktrees. Single-owner-per-file rule enforced via lane assignment. |
| **TeamCreate** | Sprint 5 Day 1 ARCH-B1 main/ipc split convergence gate ONLY. | Coupled refactor across 10+ files needs cross-checking specialists, not fan-out. |
| **`/security-review`** | Sprint 4 exit (auth/webview touches); Sprint 6 exit (PROD-B1 + ARCH-S6 touch auth/webview); Sprint 7 exit (Electron 30). | Security-touching diffs MUST pass this gate. SOFT (structured prose) but required for high/critical resolution. |
| **`/code-review --fix`** | Per-lane pre-merge, every sprint. | Catch reuse / simplification / drift before merge; auto-fix where mechanical. |
| **`/simplify`** | Sprint 5 post-ARCH-B1 to collapse helpers duplicated across the split; Sprint 7 cumulative polish. | Quality-only cleanup. Never bug-hunting (that's `/code-review`). |
| **`/verify` + `/run`** | Sprint 4 UX visual sign-off (packaged build, both themes); Sprint 6 kiosk soak verification; Sprint 7 Electron-30 smoke. | Behavioral proof in the live packaged app — dev mode hides CSP/CSS-var/titlebar regressions. The `/run` skill knows this project's launch pattern. |
| **`comprehensive-review:full-review`** | SOFT gate at every sprint exit. | Multi-dimensional grading on the merged diff. SOFT because output is prose; HARD is always tsc/eslint/vitest. |
| **`application-performance:performance-optimization`** | Sprint 4: baseline profile after PERF-B1 lands. Sprint 5: heap testing on post-refactor architecture. Sprint 6: 30-min cycling soak before v1.9 exit. | Deterministic heap assertions vs subjective DevTools judgment. |
| **`ui-design:accessibility-audit`** | Sprint 4 exit (6 a11y blockers target sites); Sprint 6 exit (full app, WCAG B target). | Required exit gate for whichever sprint owns a11y. SOFT but explicit threshold. |
| **`unit-testing:test-automator`** | Sprint 5 ARCH-B4 deliverable: write tests against the new DI'd auth + api modules. Sprint 6 PROD-B1 + PROD-S1 vitest cases. | The 2 currently-skipped tests come back online here; PROD blockers get exit-0 assertions. |
| **`code-refactoring:legacy-modernizer`** | Sprint 5 ARCH-B1 execution under the TeamCreate spec. | The specialist subagent does the move under the team's review. |
| **`frontend-mobile-development:frontend-developer`** | Sprint 6 UX polish lane. | Specialist for renderer-side Fluent v9 composition + focus management. |
| **`update-config`** | Sprint 7 (after warning backlog cleared): tighten ESLint pre-commit hook to block new warnings. | Harness-enforced gates outlive any single agent. |
| **Background Agent** | Sprint 7: packaged-build smoke build (4–8 min). | Don't block the Scrum Master's main loop on multi-minute builds. |

---

## 7. Definition of Done & CI Gates

**Global DoD (every story):**
1. `tsc --noEmit` clean for both `tsconfig.main.json` and `tsconfig.renderer.json`.
2. `eslint src --max-warnings=0` clean.
3. `npm run test` (vitest) passes including any new cases the story added.
4. Verified by **behavior** via `/verify` or `/run` against the packaged build for any IPC/CSP/auth/partition/embed/kiosk-mode change.
5. `/code-review` (medium+) clean on the diff, or findings explicitly waived with rationale.
6. Security-touching diffs also pass `/security-review` (SOFT but required for high/critical resolution).
7. No regression in headline verified fixes from Rounds 0–4 (CSP, watchdog, no-cache-nuke, select_account, slideshow canon, PBI handler detach, focus guard, fetch timeout+retry, partial-failure surfacing, store eviction on logout, real MSAL expiresOn, proactive refresh, audit-gate-as-hard, ESLint/test gate).
8. Story commit/PR cites the specific finding IDs (e.g., `UX-B1`, `ARCH-B2`, `BEH-B3`, `A11Y-B5`).
9. Docs/memory updated **same session** (CLAUDE.md, IMPLEMENTATION-PLAN-R5.md, CHANGELOG, release notes).
10. Ships only as a CI-produced installer attached to a GitHub Release. Never a hand-built local artifact.
11. **Owner approves every push, every tag, every release.**
12. HARD vs SOFT labeling explicit. A SOFT check that wasn't human-confirmed is not a passed gate.

**CI pipeline:**
- PR-triggered `ci.yml` (R3 deliverable, already shipped): tsc + lint + test + audit-report. Already enforced.
- Tag-triggered `build.yml`: builds Windows + Mac installers, attaches to GitHub Release. Already shipped.
- **Round-5 addition:** SOFT gates documented per release in `docs/audit/sprint{N}-soft-gates.md`; owner ticks them off before tagging.

---

## 8. Traceability Matrix

> Every audit finding → task ID → sprint. Deferred items explicitly listed with rationale.

### UX BLOCKERs
| Finding | Task | Sprint | Release |
|---|---|---|---|
| UX-B1 titlebar color mismatch | UX-B1 | 4 | v1.7.0 |
| UX-B2 LoginScreen MS-blue button | UX-B2 | 4 | v1.7.0 |
| UX-B3 LoginScreen fake titlebar | UX-B3 | 4 | v1.7.0 |
| UX-B4 4 viewer toolbars (3 viewers) | UX-B4 | 5 | v1.8.0 |
| UX-B4b PresentationMode toolbar | UX-B4b | 6 | v1.9.0 (dependsOn ARCH-S7) |

### UX SHOULD-FIX
| Finding | Task | Sprint |
|---|---|---|
| brand ramp Tailwind vs Fluent | UX-F1 | 4 |
| focus ring hardcoded #0078d4 | UX-S2 | 4 |
| Slider !important overrides | UX-S3 | 4 |
| sidebar active state | UX-S7 | 4 |
| sidebar collapse icon | UX-S8 | 4 |
| StatusBar duplicates info | UX-S9 | 4 |
| SearchDialog !important | UX-S10 | 4 |
| page max-width inconsistency | UX-S4 | 5 |
| ItemCard vs AppCard disparity | UX-S5 (dependsOn A11Y-B5) | 5 |
| shadow scale inconsistency | UX-S6 | 5 |
| type-color drift | UX-S13 | 5 |
| ReportViewer breadcrumb | UX-S14 | 5 |
| loading patterns inconsistent | UX-S11 LoadingState | 6 |
| empty states uneven | UX-S12 EmptyState | 6 |
| error states differ | UX-S13b ErrorState | 6 |
| UI_PATTERNS doc | UX-D1 | 7 |
| regression grep sweep | UX-D2 | 7 |

### ARCH BLOCKERs
| Finding | Task | Sprint |
|---|---|---|
| index.ts 767-LOC god-file | ARCH-B1 | 5 (Day 1 solo) |
| validation duplication | ARCH-B2 | 5 |
| Zustand circular coupling | ARCH-B3 | 6 |
| 2 skipped tests / factory DI | ARCH-B4 | 5 |

### ARCH SHOULD-FIX
| Finding | Task | Sprint |
|---|---|---|
| `teardownNow` exposure | ARCH-S1 | 5 |
| Hook decomposition | ARCH-S2 | 6 |
| IPCResponse relocation | ARCH-S3 | 5 |
| utils.ts junk drawer | ARCH-S4 | 5 |
| IPC channel naming + dead content:get-recent | ARCH-S5 | 5 |
| `app:get-partition-name` leak | ARCH-S6 | 6 |
| PresentationMode 668 LOC | ARCH-S7 | 6 |
| `useFullscreenPageNav` + 500ms setInterval | ARCH-S8 | 6 |
| validation duplication beyond settings | (absorbed into ARCH-B2) | 5 |
| magic numbers consolidation | ARCH-S10 | 5 |
| empty folders / void embedRef / azure-config / clearInvalidConfig / SearchDialog mount / CLAUDE.md / userMessage required | ARCH-N1..N7 | 7 |

### SEC SHOULD-FIX
| Finding | Task | Sprint |
|---|---|---|
| will-attach-webview | SEC-S1 | 4 |
| Electron 28→30 LTS | **SEC-S2** | **7** (was risk-deferred per PO position) |
| Export path narrow | SEC-S3 | 4 |
| lastKnownExpiry on InteractionRequired | SEC-S4 | 4 |
| Storage clear extension | SEC-S5 | 7 |
| defaultSession TODO | SEC-S6 | 7 |
| msal-node v5 | SEC-S7 | Backlog (Sprint 8+) |
| electron-builder 26 | SEC-S8 | Backlog (Sprint 8+) |
| vite 8 | SEC-S9 | Backlog (Sprint 8+) |

### BEH BLOCKERs
| Finding | Task | Sprint |
|---|---|---|
| Partition sign-in/out asymmetry | BEH-B1 | 5 |
| validateToken short-circuit lies | BEH-B2 | 5 |
| Usage per-machine | BEH-B3 (PROD-S4 merged in) | 5 |

### BEH SHOULD-FIX
| Finding | Task | Sprint |
|---|---|---|
| Auto-refresh interval recreation | BEH-S1 + PERF-S1 bundled | 5 |
| Slider optimistic race | BEH-S2 | 5 |
| Retry double-toggle | BEH-S3 | 5 |
| recordItemOpened post-logout race | BEH-S4 | 5 |
| AppViewer no online retry | BEH-S5 | 5 |
| LOGIN_IN_PROGRESS stuck | BEH-S6 | 5 |
| userMessage in hook token-error | BEH-S7 | 5 |

### PERF
| Finding | Task | Sprint |
|---|---|---|
| **autoRefresh default 1 min** | **PERF-B1 (decoupled from ARCH-S10)** | **4** |
| Auto-refresh recreation | PERF-S1 (bundled with BEH-S1) | 5 |
| PresentationMode embed.off bypass | PERF-S2 (dependsOn ARCH-S1) | 5 |
| electron-log no maxSize | PERF-S3 | 5 |
| mousemove double-bound | PERF-S4 | 5 |

### A11Y BLOCKERs
| Finding | Task | Sprint |
|---|---|---|
| LoginScreen MessageBar no role=alert | A11Y-B1 | 4 |
| 3 error overlays no role=alert | A11Y-B2 | 4 |
| TitleBar avatar no aria-label | A11Y-B3 | 4 |
| Icon-only buttons | A11Y-B4 | 4 |
| ItemCard keyboard-DEAD | A11Y-B5 | 4 (UX-S5 dependsOn) |
| SearchDialog combobox wrong element | A11Y-B6 | 4 |

### A11Y SHOULD-FIX (sample; all 15+ items in Sprint 6 polish sweep)
A11Y-S1..S15 → Sprint 6.

### PROD BLOCKERs
| Finding | Task | Sprint |
|---|---|---|
| No account switcher | PROD-B1 | 6 (dependsOn BEH-B1 from Sprint 5) |
| autoStartReportId dead code | PROD-B2 | 5 |
| First-install empty Home | PROD-B3 (+ vitest "CTA visible after nav cycle") | 5 |

### PROD SHOULD-FIX
| Finding | Task | Sprint |
|---|---|---|
| Kiosk mode | PROD-S1 (+ vitest backoff + 30-min soak SOFT) | 6 |
| Check for updates | PROD-S2 | 5 |
| Avatar tenant chip | PROD-S3 | 5 |
| Usage clear in logout | (merged into BEH-B3) | 5 |
| Pinned/Favorites | PROD-S5 | 7 |
| AppViewer nested webview | PROD-S6 | 6 |
| Sign-out confirmation | PROD-S7 | 5 |
| ReportViewer Back history | PROD-S8 | 5 |
| Dashboard freshness | PROD-S9 | 6 |
| Slide progress bar | PROD-S10 | 5 |

### Intentionally deferred to Backlog (Sprint 8+)
| Finding | Why |
|---|---|
| SEC-S7 msal-node 2→5 | High-risk major bump; defer until after Electron 30 stabilizes; Context7 reconnaissance in Sprint 7 docs. |
| SEC-S8 electron-builder 24→26 | Build-tooling, lower urgency than Electron itself. |
| SEC-S9 vite 5→8 | Build-tooling. |
| In-presentation search / pen inking / data alerts / email snapshots | Owner explicitly declined in Round 1 product research. |

---

## 9. Risk Register & Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **ARCH-B1 main-process split introduces regressions** | Medium | High | Pre-split tag `v1.7.0-pre-arch-split` preserved; lands solo Day 1 of Sprint 5; full smoke before fan-out; TeamCreate cross-check; 1-week soak before Sprint 6 piles on. |
| **Electron 30 bump breaks Power BI embed / webview / auth** | Medium | High | Context7-driven prep; **isolated Sprint 7 lane gated on v1.9 48h field stability**; pre-bump tag `v1.9.0-electron28-fallback`; rollback installer preserved in `dist/rollback/`; canary cohort (2–3 users on 2 tenants) for 5 business days before fleet rollout; CHANGELOG documents user-facing rollback procedure. |
| **BEH-B3 usage migration loses data silently** | Low | Medium | Pre-migration backup to `usage.pre-v1.7.0.bak.json`; log line with count; CHANGELOG entry. Users can restore if needed. |
| **PROD-B1 account switcher fails partial-state on cookie clear** | Medium | High | Depends on BEH-B1 partition symmetry landing first in Sprint 5; vitest asserts content+search+usage+cookies all cleared on switch; owner SOFT two-tenant smoke before tag. |
| **A11Y-B5 ItemCard keyboard fix regresses when UX-S5 lands** | High | Medium | UX-S5 `dependsOn` A11Y-B5; mandatory vitest keyboard-activation case in UX-S5. |
| **PROD-S1 kiosk mode powerSaveBlocker fails silently** | Low | Medium | vitest backoff schedule + 30-min unattended soak on real display as exit gate. |
| **Single-owner-per-file rule violated by parallel agents** | Medium | High | Lane-assignment table in §5; merge order documented; worktree isolation enforced. |
| **Sprint 4 deadline slip due to over-scoping** | Medium | Medium | Realistic T+5d allows for the antagonist-corrected scope (a11y + brand + perf hotfix + SEC fast-lane only; no refactor, no Electron). |
| **comprehensive-review:full-review treated as HARD gate (per global rule on prose)** | Low | Low | Explicitly SOFT in §7; HARD is always `tsc && eslint && vitest`. |

**Rollback infrastructure summary:**
- **`v1.7.0-pre-arch-split`** tag: Sprint 5 ARCH-B1 fallback target.
- **`v1.9.0-electron28-fallback`** tag: Sprint 7 SEC-S2 fallback target.
- **`dist/rollback/Power BI Viewer-1.9.0-Windows-Setup.exe`**: preserved installer for end-user downgrade.
- **CHANGELOG entries**: each release documents what changed + how to roll back if needed.
- **Owner-approval gate**: every push, every tag, every release — Scrum Master never auto-publishes.

---

## 10. Ceremonies & Cadence

- **Sprint Planning (start of each sprint):** `Plan` + `Glob`/`Grep`/`Read` to confirm finding file:line against current tip (line numbers from this doc decay; verify on disk). Context7 batch fetches up front for the sprint's risky APIs. `TaskCreate`/`TaskList` build the shared backlog. Scrum Master draws the dependency graph so non-contingent work fans out; only true dependencies serialize.
- **Daily Standup (control-return sync — no wall clock):** `TaskList`/`TaskGet` read the board on each control-return; reassign stalled tasks; re-dispatch unblocked work. `SendMessage` reconciles cross-flagged findings between lanes. `EnterWorktree`/`ExitWorktree` isolates file-mutating agents per the single-owner table in §5.
- **Per-Task Verification Gate (every completion):** `/verify`/`/run` for packaged-build behavioral changes; `/code-review --fix` per lane; `/security-review` for security/auth/webview diffs; `ui-design:accessibility-audit` for a11y diffs; `application-performance:performance-optimization` profile for perf diffs. HARD (tsc/eslint/vitest) is the floor; SOFT checks are logged human-confirmed.
- **Sprint Review (exit gate):** HARD gates exit-0 first. SOFT gates (full-review, security-review, accessibility-audit, owner manual checks) before any push. **Owner asked before every push/tag/release.**
- **Sprint Retrospective:** cross-flagging is signal — when ≥2 lanes surface the same issue, elevate to a shared task. `update-config` applies process fixes (Sprint 7 ESLint pre-commit tighten after warning backlog cleared). Archive shipped-sprint docs immediately; update `CLAUDE.md` and `docs/IMPLEMENTATION-PLAN-R5.md` same session.

---

**End of plan.** The corrected planning-integrity invariants:
1. **Scope per release matches what actually ships** (antagonist §4 release reshuffle applied).
2. **ARCH-B1 in Sprint 5, not Sprint 4** (PO position; SEC-S2 hold-clause void for Sprint 4).
3. **PERF-B1 decoupled from ARCH-S10** — ships v1.7.0 as one-line edit.
4. **SEC-S2 Electron 30 in Sprint 7 / v2.0.0** with canary, rollback installer, and explicit owner sign-off.
5. **Single-owner-per-file** documented per sprint in §5.
6. **Merged duplicate tasks**: PROD-S4 into BEH-B3; BEH-S1+PERF-S1 bundled; BEH-B1+B2 bundled.
7. **Every BLOCKER has a task ID** including the previously-unmapped ARCH-B2 and the partial UX-B4/PROD-B3.
8. **HARD vs SOFT gates explicit** — `comprehensive-review:full-review` is SOFT.
9. **Rollback infrastructure** — pre-split tag, pre-bump tag, preserved installer, CHANGELOG procedure.
10. **Owner asked before every git push, every tag, every release.**
