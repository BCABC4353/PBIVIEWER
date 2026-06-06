# Power BI Viewer — Implementation Plan (Agile Scrum)

> **Status:** FINAL — antagonist corrections applied. This is the document the team executes from.
> **Branch of record:** `sprint0-hardening` (canonical repo `C:\Users\Brendan Cameron\Desktop\powerbi-viewer`). The sibling `powerbi-viewer - Copy` dir is **quarantined** — no agent builds against it.
> **Authoritative audit files:** `docs/audit/PRODUCTION-READINESS-TEARDOWN.md`, `docs/audit/PERFORMANCE-MEMORY-AUDIT.md`, `docs/audit/findings-raw.json`.

---

## 0. PRE-FLIGHT — Sprint 0 Task #0 (BLOCKER, do before anything else)

The antagonist verified that `sprint0-hardening` currently carries **44 uncommitted changes** (40 tracked modifications/deletions + untracked `src/renderer/hooks/`, `src/shared/utils.ts`, `src/shared/ipc-types.ts`, `docs/`). `git worktree add` checks out the **committed tip** and will silently drop all of this. Every fan-out lane would build against a tree missing the in-progress work, produce phantom diffs, and collide on merge. This contradicts the plan's own cited finding `no-lockfile-determinism-guard`.

| id | title | action | gate (exit-0) |
|---|---|---|---|
| **PRE-0** | Commit WIP checkpoint | One `wip: sprint0 checkpoint` commit (or stash) capturing all 44 changes on `sprint0-hardening`. | `git status --short` returns **empty** |
| **PRE-1** | Inventory untracked `hooks/` + `shared/utils.ts` | Read-only `Explore` of `src/renderer/hooks/` and `src/shared/` to discover what already exists. `usePowerBIEmbed` may be **half-built**; `getErrorMessage`/`isTokenExpiredError` in `utils.ts` are **untracked**, not baseline. Reconcile against VIEW-HOOK scope before any refactor planning. | A reconciliation note appended to the VIEW-HOOK story; `Explore` output recorded |
| **PRE-2** | Worktree pre-flight guard | No `EnterWorktree` may run until PRE-0 is green. Each lane worktree is pinned to the post-PRE-0 tip of `sprint0-hardening`. | `git status --short` empty **immediately before** each `EnterWorktree` |

**Hard rule:** PRE-0 → PRE-1 → PRE-2 serialize and precede every other Sprint 0 task. The "Plan/Explore confirm file:line on disk" ceremony runs against the **actual dirty-then-committed tree**, not assumptions.

---

## 1. Executive Summary & Product Goal

**What we ship:** a trustworthy Power BI Viewer for 20 non-technical users that (a) installs without scaring them off, (b) lets them grab a known-good build from GitHub whenever needed, and (c) survives a full day of report cycling without freezing, leaking memory, or silently logging them out.

**Distribution model — manual download from GitHub Releases (owner decision):** there is **no in-app auto-update**. Because the build is unsigned, electron-updater cannot apply an update without a SmartScreen/UAC prompt anyway — so an auto-update channel would be pure friction with no payoff, plus a moving part that can break. Instead, every release is a **CI-produced installer attached to a GitHub Release**; users download the `.exe` from the Releases page on their own machines and install it (clicking through SmartScreen once, per the install guide). "Updating" = the operator posts a new GitHub Release and notifies the 20 users (email/Teams) to download and reinstall. This is simpler, has no delivery channel to fail, and the prior installer always stays on GitHub as one-click rollback.

**Readiness bar (Monday):** the day-one freeze / logout / leak landmines are dead, the installer is producible from CI and attached to a GitHub Release, and the security boundary (CSP) is verified **in the packaged build**, not dev. Signing (the #1 backlog item) retires the SmartScreen click-through in R2.

**Success metrics:** zero stuck-spinner support calls; every user can install the latest build from the GitHub Releases page by following the one-page guide (one SmartScreen click-through while unsigned; clean install after R2 signing); no per-session heap growth on weaker machines.

---

## 2. Release Plan

Each release exits on a gate split into **HARD (exit-0 command)** and **SOFT (human-confirmed, live-tenant)** tiers (antagonist §5). A failed SOFT check cannot be silently waved through; a passing `tsc` cannot masquerade as behavioral proof.

### R0 — Monday Unsigned MVP — **2026-06-08 (Mon)**
**Scope:** PRE-0/1/2; CI audit gate unblocked (`continue-on-error`, verified via `workflow_dispatch`); mac decoupled from the Windows release; CSP re-bound to `session.fromPartition(PARTITION_NAME)` + `<meta>` fallback + `object-src 'none'`/`base-uri 'self'`/`frame-ancestors 'none'`, **verified packaged**; single-instance lock; main-window `setWindowOpenHandler`; embed watchdog + non-token error surfacing across all 3 viewers; PBI handler detach (`report.off`); focus-thrash guard; slideshow interval canonicalization + persistence; auth cache-nuke removal + `prompt=select_account`; **guarded usage-store construction (pulled forward — see §1 orphans)**; SmartScreen click-through guide (doubles as rollback-reinstall guide). Distribution = **CI-produced installer attached to a GitHub Release for manual download** (no auto-update). UNSIGNED.

**HARD gate (all exit-0):**
1. `gh workflow run build.yml --ref sprint0-hardening` → windows job `conclusion=success` through package step; `gh run download` yields a non-empty `.exe`.
2. `tsc --noEmit` clean for both `tsconfig.main.json` and `tsconfig.renderer.json`.
3. `grep` assertions: no `logout()`/`clearCache()` in `getAccessToken`/`validateToken` (only inside `logout()` body); `select_account` present in `login()`; no user-facing "CSRF attack" string.
4. `/security-review` on the **merged** sprint0-hardening diff → **zero new high/critical**.
5. `git status --short` empty before each worktree; 4 stream-tagged commits with disjoint file sets.

**SOFT gate (human-confirmed, live AAD tenant + packaged build):**
6. Packaged build: DevTools Network shows the CSP header on the `PARTITION_NAME` renderer doc; embeds still load. (Dev is INVALID for this check.)
7. The CI-produced installer downloads from the GitHub Release page and installs cleanly on a fresh machine (one SmartScreen click-through), per `docs/INSTALL-GUIDE.md`.
8. No-permission/throttled report yields actionable error+Retry within 45s in all 3 viewers (no infinite spinner).
9. Token-expiry/CA-reauth no longer wipes account cache (re-auth prompt instead); logout→login switches accounts; double-launch opens one window.
10. 30-min open/close cycling of 30+ reports shows no monotonic PBI-handler heap growth (DevTools snapshot — **manual until the heap-assertion harness exists in R1**).

**Owner sign-off:** unsigned-distribution risk + click-through guide + **staged-rollout plan (pilots first)** accepted.

### R1 — Resilience + Observability — **2026-06-12 (Thu)**
**Scope:** the first feature update, distributed as a new GitHub Release for users to download. AbortController+timeout on every fetch; retry-with-backoff honoring `Retry-After` on 429/5xx; `getAllItems` partial-failure surfacing; `dataset-refresh-info-success-on-failure` fix (pulled forward — product theme); electron-log → userData + renderer ErrorBoundary/unhandledrejection wired; real MSAL `expiresOn` threaded; **proactive visibility-independent refresh timer (`no-proactive-refresh-while-visible`, kiosk token death — pulled forward)**; webview teardown; content/search store eviction on logout; status-code error mapper; `usePowerBIEmbed` extraction (absorbs the R0 per-viewer fixes); **heap-snapshot assertion harness built**.

**HARD gate:** electron-log writes to userData (`Test-Path` true; `Select-String 'Bearer|eyJ'` zero matches); retry test green; `comprehensive-review:full-review` + `/code-review` clean; `tsc` clean; heap harness exits 0 (open/close 20, GC, baseline return); CI tag produces a GitHub Release with `Setup.exe` attached.
**SOFT gate:** R1 installer downloads from GitHub Releases and installs over R0 on **≥2 pilot machines/VMs** (one SmartScreen click-through, unsigned). `getAllItems` with one 403'd workspace surfaces `partialFailure` in UI. Logout clears stores (next account sees empty).
**Contingency:** if R1 regresses on pilots, leave the GitHub Release as a **draft / unannounced** → pilots stay on R0; fix forward before widening to the other 17.

### R2 — Signed Installer + Maintainability — **2026-06-19 (Thu), cert-dependent**
**Scope:** OV/EV cert into CI (`CSC_LINK` + `CSC_KEY_PASSWORD`); EV bypasses SmartScreen, retires the install-time click-through; centralize token-refresh divergence into the hook; delete dead code (ContentTabs, AppsList, dead constants, unused viewer imports); `esbuild.drop:['console']`; version-bump gate; `.nvmrc`; AAD app-reports pagination; error mapping; auth-window hardening; single-flight token lock.
**HARD gate:** `signtool verify /pa Setup.exe` passes; `architect-review` approves hook extraction; `tsc` clean; bundle grep finds zero `console.`.
**SOFT gate:** fresh-VM install triggers no SmartScreen block; `usePowerBIEmbed` is the sole embed path for all 3 viewers.
**Slip rule:** if cert procurement slips, R2-minus-signing still ships on date; signing ships the moment the cert lands.

### R3 — Quality Net + Long-tail Hardening — **2026-06-26 (Thu)**
**Scope:** ESLint (typescript-eslint + react-hooks/exhaustive-deps + no-console) + `noUnusedLocals`/`noUnusedParameters`; pre-commit lint hook via `update-config`; PR-triggered CI (lint+typecheck+test); Vitest harness + first smoke tests; remediate 27 vulns (18 high) + **re-enable audit gate (single owner)**; input validation; guarded store construction (residual); a11y/focus-trap in presentation; settings re-sync; HiDPI export; IPC channel const map + typed `IPCResponse<T>`; list virtualization >100; search fan-out scaling decision spike.
**HARD gate:** `npm audit --audit-level=high` passes + gate re-enabled as **hard** CI gate; `eslint src --max-warnings=0` exit 0; smoke tests green in CI on PR; pre-commit hook rejects a lint error.
**SOFT gate:** `ui-design:accessibility-audit` returns no critical WCAG blockers in presentation mode; no P0/P1 findings open.

---

## 3. Epics (P0–P3)

| Epic | Priority | Value/Risk |
|---|---|---|
| **EPIC-DELIVERY** | P0 | Producible CI installer attached to a GitHub Release for manual download. No auto-update — unsigned makes it unreliable; manual download is simpler and rollback is one click. |
| **EPIC-TRUST** | P0 | Install trust + code signing. Unsigned Monday w/ click-through; OV/EV is #1 backlog (R2). |
| **EPIC-SECBOUND** | P0 | CSP enforced in packaged build; re-arms the token/webview mitigations the threat model assumes. |
| **EPIC-EMBED** | P0 | Embed lifecycle: no stuck spinners. The #1 day-one ticket. |
| **EPIC-AUTH** | P0 | Auth resilience + account switching; routine expiry re-prompts, not silent logout. |
| **EPIC-PERF** | P0 | Memory + focus stability under cycling. Both bite within an hour. |
| **EPIC-RESILIENCE** | P1 | Network resilience + partial-failure honesty. |
| **EPIC-OBSERV** | P1 | Observability so bugs arrive as logs, not phone calls. |
| **EPIC-STATE** | P1 | State freshness + cross-user isolation. |
| **EPIC-MAINT** | P2 | Collapse 3 viewers into one `usePowerBIEmbed` hook. |
| **EPIC-QUALNET** | P2 | ESLint + tests + vuln remediation + re-enabled audit gate. |
| **EPIC-A11Y-LONGTAIL** | P3 | Focus traps, virtualization, pagination, HiDPI exports. |

---

## 4. Sprint Breakdown

> **Effort key:** XS ≤1h · S 1–3h · M 3–6h · L 1–1.5d.
> **Per-file single-owner rule (antagonist FP-1/2/3, applied globally):**
> - `src/main/index.ts` → **one owner** for the whole effort.
> - `src/main/auth/auth-service.ts` → **one owner**.
> - `src/main/services/powerbi-api.ts` → **one owner**, sequenced sub-stream.
> - `src/shared/constants.ts`, `auth-store.ts`, `search-store.ts`, `SearchDialog.tsx` → **one owner each** across streams.

### SPRINT 0 — Weekend Distribution Gate
**Goal:** make the app installable (download from a GitHub Release) and free of day-one freeze/logout/leak landmines. Ship the unsigned MVP by Monday.
**Duration:** ~2 days (Sat 06-06 → Mon 06-08).
**Exit gate:** R0 HARD+SOFT gates above; owner sign-off on unsigned risk + staged rollout.

#### Stream A — Build/Infra (owner: build-infra agent)
| id | title | story | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|---|
| **BUILD-01** | CI audit report-only + decouple mac | As release owner I want a v* tag to produce an installer. | XS | `.github/workflows/build.yml` | `continue-on-error:true` on audit (lines 29,64); `release.needs=[build-windows]` so a mac failure can't block Windows. | `gh workflow run build.yml --ref sprint0-hardening && gh run watch` → windows job success, `.exe` artifact | PRE-2 |
| **TOOL-04** | Prove audit-gate unblock pre-tag | As release owner I want the pipeline proven before tagging. | XS | (none) | workflow_dispatch run reaches package step, emits downloadable `.exe`. | `gh run view <id>` windows `conclusion=success`; `gh run download` non-empty `.exe` | BUILD-01 |
| **DIST-01** | SmartScreen click-through + rollback guide | As a non-technical user I want install/rollback instructions. | S | `docs/INSTALL-GUIDE.md`, `electron-builder.yml` | "More info → Run anyway" guide; states Unknown publisher; SHA-256 in Release notes; **doubles as rollback-reinstall guide with prior known-good installer + its SHA-256 pinned** (see §9 rollback). Signing vars commented `TODO`. | Clean VM: follower installs; hash matches | PRE-2 |

#### Stream B — Main-Process Security (owner: **single `index.ts` owner** + auth owner)
| id | title | story | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|---|
| **SEC-01** | CSP session binding | As owner I want CSP enforced on the prod partition. | M | `src/main/index.ts`, `src/renderer/index.html` | CSP on `session.fromPartition(PARTITION_NAME)` + `<meta>` fallback + `object-src 'none'`/`base-uri 'self'`/`frame-ancestors 'none'`; frame-src/connect-src exact. | `package:win` then DevTools Network shows CSP on partition doc; embeds load; **dev INVALID** (SOFT) | PRE-2 |
| **SEC-02** | Single-instance lock | As a user I want one window on double-launch. | XS | `src/main/index.ts` | `requestSingleInstanceLock` before `whenReady`; quit if not held; second-instance focuses main. | Double-launch → one process, focuses (SOFT); `tsc` (HARD) | PRE-2 |
| **SEC-03** | Main-window `setWindowOpenHandler` | As owner I want `window.open` denied on main. | XS | `src/main/index.ts` | Deny-all handler; http/https → `shell.openExternal`. | Packaged `window.open` → no window (SOFT); `tsc` (HARD) | PRE-2 |
| **AUTH-01** | Stop silent-token failure nuking cache | As a returning user I want re-prompt, not full logout. | S | `auth-service.ts`, `auth-store.ts` | Remove `logout()` from `getAccessToken` InteractionRequired catch and from `validateToken`; return `{success:false, INTERACTION_REQUIRED}` without mutating cache; `checkAuth` sets "session expired" message. | `grep -nE "logout\(\)\|clearCache\(\)" auth-service.ts` → only inside `logout()` body (HARD); `tsc` (HARD); relaunch-after-expiry keeps account (SOFT) | PRE-2 |
| **AUTH-02** | `prompt=select_account` | As a user I want to switch accounts at login. | XS | `auth-service.ts` | `prompt:'select_account'` in `login()` `authCodeUrlParams`; not on silent. | `grep -n "select_account"` hit in `login()` (HARD); picker appears (SOFT) | AUTH-01 |
| **USAGE-01** | Guarded usage-store construction *(pulled forward — antagonist §1)* | As a non-technical user I want the app to boot even with a corrupt usage file. | S | `src/main/services/usage-tracking-service.ts` | Module-top store construction wrapped in try/catch with recovery (reset to empty on parse failure); covers `usage-store-read-throws-unhandled` which SEC-02 does **not** (SEC-02 stops dual-writer *cause*, not crash on already-corrupt file). | `tsc` (HARD); launch with a deliberately corrupted usage file → app boots to login (SOFT) | PRE-2 |

#### Stream C — Viewer/Embed (owner: viewer-core agent; **internally serial**, single owner for the 3 viewer files)
| id | title | story | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|---|
| **VIEW-01** | Embed watchdog + non-token error surfacing | As a user on a slow network I want error+Retry, not an eternal spinner. | S | ReportViewer/DashboardViewer/PresentationMode `.tsx` | 35–45s `watchdogRef` after embed; cleared in `loaded` + cleanup; ReportViewer non-token fatal error → `setError`+`setIsLoading(false)`; ref cleared on every unmount. | `tsc` (HARD); stalled embed → error+Retry within ~45s in all 3 (SOFT, live tenant) | PRE-2 |
| **VIEW-02** | Detach PBI handlers (`report.off`) | As a user cycling reports I want each embed torn down. | S | 3 viewer `.tsx` | `registeredEventsRef:string[]`; `forEach(off(n))` before `reset(container)` in `finally`. | `tsc` (HARD); 40× open/close → flat detached-node/listener count (SOFT until R1 harness) | VIEW-01 |
| **VIEW-03** | Focus-thrash guard | As a fullscreen user I want my slicer clicks to stick. | S | ReportViewer.tsx | Replace 200ms `setInterval` with `focusout`+rAF guard refocusing only when `activeElement===body`; body-guard the two stray `setTimeout`s; keep keydown reclaim. | `tsc` (HARD); fullscreen slicer stays open + arrow-nav works (SOFT) | VIEW-01 |
| **VIEW-07** | Slideshow interval canonicalize + persist | As a presenter I want one range that sticks. | S | PresentationMode.tsx, SettingsPage.tsx, **constants.ts (constants owner)** | One `SLIDESHOW_INTERVAL={MIN,MAX,STEP,DEFAULT}`; both sliders import it; debounced `settings.update` on in-viewer change; guard load-effect clobber; delete dead constants. | `tsc` (HARD); change-in-presentation persists on reopen + matches Settings (SOFT) | VIEW-01 |

#### Cross-cutting process (Sprint 0)
| id | title | effort | dependsOn | gate role |
|---|---|---|---|---|
| **TOOL-01** | Context7 query-docs before BUILD-05, AUTH-01, TEST-01 | XS | — | Process: each unfamiliar-lib task opens with a recorded `get-library-docs` fetch (electron-builder, msal-node, vitest). |
| **TOOL-02** | Worktree fan-out of Streams A/B/C/(D deferred) | S | PRE-2 | Lanes A/B disjoint; C internally serial. **index.ts is NOT in Lane C** (FP-4 correction): A writes build.yml only; the single index.ts owner sits in Lane B. |
| **TOOL-03** | TeamCreate cross-check on CSP+auth diff | S | TOOL-02 | security-auditor + architect-review + typescript-pro reconcile the coupled CSP/token findings. Time-boxed to Lane B diff. |
| **TOOL-06** | `/code-review --fix` + `/simplify` per lane pre-merge | S | TOOL-02 | Per-lane reviewable commits (preserves `/security-review` signal). |
| **TOOL-05** | `/security-review` = Sprint 0 hard exit gate | S | TOOL-03, TOOL-04 | Runs on **merged** diff; any high/critical = hard stop. |
| **TOOL-08** | `update-config` lint/typecheck on-edit hook | S | — | Land **early** so subsequent lanes inherit it. **Warn-only** for no-console/exhaustive-deps until R3 cleanup (else every edit blocks on pre-existing violations). |

> **DEFERRED OUT OF SPRINT 0 (antagonist §4):** **TEL-01 electron-log → R1** (its channel ships R1; telemetry-before-channel is premature). **DX-01 console-strip → R2** (collides with the deferred hook; `esbuild.drop` lands with R2 maintainability). The Stream D (`constants.ts`/`SettingsPage` slideshow) work is folded into VIEW-07 under the single constants owner.

---

### SPRINT 1 — Resilience + Observability
**Goal:** ship the first feature update as a new GitHub Release users download. Add resilience, telemetry, real expiry, proactive kiosk refresh, webview teardown; extract the hook.
**Duration:** 3 days (Tue 06-09 → Thu 06-12).
**Exit gate:** R1 HARD+SOFT; R1 installer published to a GitHub Release and installs on ≥2 pilots; `comprehensive-review:full-review` clean.

| id | title | story | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|---|
| **BUILD-02** | Add electron-log dependency | As release owner I want a logging sink for telemetry. | XS | `package.json` | Add `electron-log` only — **no electron-updater** (manual-download model). | `npm ls electron-log` resolves; `tsc` clean | BUILD-01 |
| **BUILD-05** | CI attaches installer to GitHub Release + mac non-blocking | As release owner I want a v* tag = a GitHub Release users can download from. | S | `.github/workflows/build.yml` | Existing `release` job (softprops/action-gh-release) attaches the Windows `.exe` to the Release; `release.needs=[build-windows]` only. No auto-update artifacts (no latest.yml/blockmap). | Tag → `gh release view` shows `Setup.exe` attached and downloadable | BUILD-01 |
| **TELEM-01** *(MERGES BUILD-04 + TEL-01 + TOOL-12 — antagonist FP-1)* | electron-log telemetry + crash capture + error mapper | As release owner I want crashes/errors in an attachable log. | M | `src/main/index.ts` (**owner**), `src/renderer/main.tsx`, `ErrorBoundary.tsx`, `package.json` | `electron-log/main` init; `errorHandler.startCatching()`; renderer `unhandledrejection`+ErrorBoundary routed; `log:open-folder` IPC; status-code mapper (403→"no access"); **no tokens/PHI logged**. | `Test-Path %APPDATA%\powerbi-viewer\logs\main.log`=True; `Select-String 'Bearer\|eyJ'` zero (HARD) | — |
| **VIEW-HOOK** *(MERGES QUAL-02 — antagonist SEQ-3; one owner, one dep set)* | Extract `usePowerBIEmbed` | As a maintainer I want one embed path. | L | `usePowerBIEmbed.ts`, 3 viewers, `usePowerBIService.ts` | Single hook owns embed/token/refresh/lifecycle; absorbs VIEW-01 watchdog + VIEW-02 `off()`; isLoadingRef → generation counter; **reconcile with PRE-1 inventory of existing untracked `hooks/`**. | `tsc` (HARD); embed-hook smoke test green; rapid report→report no wrong-report flash (SOFT) | VIEW-01, VIEW-02 |
| **AUTH-03** | Clear AAD cookies on logout | As shared-machine user I want logout to end my session. | S | `auth-service.ts` | `session.defaultSession.clearStorageData({storages:['cookies']})` in `logout()` try/catch; **code comment tying target session to auth-window partition** (re-verify if partition moves). | `grep -n "clearStorageData"` in `logout()` (HARD); switch accounts end-to-end (SOFT) | AUTH-02 |
| **AUTH-05** | Thread real MSAL `expiresOn` | As the embed layer I want true expiry. | M | `auth-service.ts`, `powerbi-api.ts`, `shared/types.ts` | `getAccessToken` returns `{accessToken,expiresOn}`; `getEmbedToken` uses it (+1h only as null fallback); all callers updated. | `grep "3600000" powerbi-api.ts` → only null-fallback; `tsc` strict (HARD) | AUTH-01 |
| **REFRESH-01** *(NEW — antagonist §1 orphan `no-proactive-refresh-while-visible`)* | Proactive visibility-independent refresh timer | As a kiosk/wall-display user I want the token to refresh while foregrounded. | S | `usePowerBIEmbed.ts` | Refresh scheduled off the real `expiresOn` (AUTH-05), **not** only on `visibilitychange`; timer in the hook, generation-guarded. | `tsc` (HARD); leave a report foregrounded past token lifetime → no silent expiry (SOFT) | VIEW-HOOK, AUTH-05 |
| **VIEW-04** | Webview teardown (AppViewer) | As a user opening apps I want each released. | XS | `AppViewer.tsx` | `useEffect(()=>()=>{wv.stop?.(); wv.src='about:blank'})`. **Fully parallel** (only file with no contention). | `tsc` (HARD); guest process returns to baseline (SOFT) | — |
| **RESIL-01** | AbortController+timeout on every fetch | As a user on flaky net I want fail-fast. | S | `powerbi-api.ts` (**owner, sub-stream**) | `fetchWithTimeout(20s)` on all 5 sites; per-poll timeout. | `tsc`; pull cable mid-load → error within ~20s (SOFT) | — |
| **RESIL-02** | Retry+backoff honoring Retry-After | As a Monday-morning user I want transient 429/5xx retried. | M | `powerbi-api.ts` | `withRetry` (3×) on 429/5xx/network; honor `Retry-After`; never retry non-429 4xx. | `tsc`; 429+Retry-After:5 → ~5s then 200 (SOFT) | RESIL-01 |
| **RESIL-03** | Surface `getAllItems` partial failures | As a user with one bad workspace I want to know the catalog is incomplete. | M | `powerbi-api.ts`, `shared/types.ts`, **search-store.ts (store owner)** | `partialFailure`+`failedWorkspaces` in data shape (not the union); all-failed → `success:false`; banner in UI. | `tsc` (HARD, proves ripple); one 403'd workspace → banner (SOFT) | RESIL-02 |
| **REFRESH-02** *(NEW — antagonist §1 orphan `dataset-refresh-info-success-on-failure`)* | `getDatasetRefreshInfo` honest failure | As a user I want refresh info to report failure, not fake success. | S | `powerbi-api.ts` | Return `{success:false,error}` on failure instead of `success:true`; aligns with "no silent success" theme. | `tsc` (HARD); forced failure → error surfaced (SOFT) | RESIL-02 |
| **STATE-01** | Evict content/search stores on logout | As shared-machine user I want prior content gone. | S | `content-store.ts`, **search-store.ts (owner)**, **auth-store.ts (owner)** | `reset()` clears Maps/arrays + module-global `searchCache` + bumps `currentSearchId`; called in `logout()` after IPC resolves. | `tsc`; user A→logout→user B sees empty (SOFT) | AUTH-01 (auth-store sequencing) |
| **STATE-02** | Wire `invalidateCache` to Refresh | As a user I want Refresh to re-fetch. | S | search-store.ts, WorkspacesPage.tsx | `invalidateCache()` in all Refresh handlers; share clear impl with STATE-01. | `tsc`; rename report → Refresh → search shows new name (SOFT) | STATE-01 |
| **TELEM-GATE** / **TOOL-14** | `comprehensive-review:full-review` = R1 exit gate | — | S | (Sprint-1 diff) | No unresolved high/critical across all dimensions before the R1 GitHub Release is posted. | full-review report zero high/critical (HARD) | all R1 streams |
| **HEAP-HARNESS** / **TOOL-10** | Heap-snapshot assertion harness *(antagonist §5 — makes R0 gate #8 real)* | As a perf owner I want a deterministic leak gate. | M | test harness | Open/close 20 reports, force GC, assert `report.off` called per handler + Embed count == baseline. | Harness exits 0 (HARD) | VIEW-HOOK |

**Sprint 1 exit gate:** R1 HARD+SOFT met; **R1 installer downloads from the GitHub Release and installs on ≥2 pilots (one SmartScreen click, unsigned)**; if it regresses → keep the Release as a draft, pilots stay on R0.

---

### SPRINT 2 — Trust + Collapse Duplication
**Goal:** wire the OV/EV cert (#1 backlog item) and finish maintainability so future embed fixes land once.
**Duration:** 5 days (Fri 06-13 → Thu 06-19).
**Exit gate:** R2 HARD+SOFT; `architect-review` approves; cert-slip rule applies.

| id | title | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|
| **DIST-02** | Code-signing cert in CI | L | `electron-builder.yml`, `build.yml` | `WIN_CSC_LINK`+`WIN_CSC_KEY_PASSWORD`; EV via HSM/Azure Trusted Signing; retires the install-time SmartScreen click-through. | `signtool verify /pa Setup.exe` (HARD); fresh-VM no SmartScreen (SOFT) | BUILD-05 |
| **BUILD-06** | Version-bump gate | XS | `build.yml`, `package.json` | Early step: tag vs package.json version, exit 1 on mismatch. | Mismatched tag → job non-zero (HARD) | BUILD-05 |
| **DX-01** *(moved from S0; reconcile w/ VIEW-05 — antagonist FP-5)* | `esbuild.drop` console strip + delete 9 debug handlers | XS | **verify real config path on disk** (`vite.config.ts` vs `electron.vite.config.ts`), ReportViewer.tsx | `esbuild:{drop:['console','debugger']}`; delete debug handlers (some log report data). **One task, not two.** | bundle grep `console.` == 0 (HARD) | VIEW-HOOK |
| **AUTH-04** | Auth-window timeout + sandbox + AAD error parse | M | `auth-service.ts` | `sandbox:true`; 120s timeout (settled-guard, single resolve); parse `error`/`error_description`. | `grep` sandbox/setTimeout/error_description (HARD); consent-denied → message (SOFT) | AUTH-01 |
| **AUTH-06** | Single-flight token lock | S | `auth-service.ts`, `powerbi-api.ts` | `inFlight` promise; reset in `finally` on success+throw. **Residual note:** AUTH-01 alone left the concurrent-`persistCache` race live for R0/R1 — closed here (antagonist SEQ-6). | concurrent fan-out → one `acquireTokenSilent` (SOFT); `tsc` | AUTH-01, AUTH-05 |
| **AUTH-07** | Soften CSRF / blank-bounce UX | S | `auth-service.ts`, **auth-store.ts (owner)**, LoginScreen.tsx | Benign "in progress" on double-click; neutral CSRF message (code unchanged for logs); warning-vs-error intent. | `grep "CSRF attack"` → no user-facing string (HARD) | AUTH-01 |
| **API-01** | App-reports pagination | S | `powerbi-api.ts` | `getAppReports`/`getAppDashboards` use `fetchAllPages` (inherits RESIL timeout/retry). | `tsc`; multi-page app returns all (SOFT) | RESIL-02 |
| **API-02** | Map HTTP/OData errors | S | `powerbi-api.ts`, **constants.ts (owner)** | `mapApiError` table in constants; 401/403/404/429/5xx/network friendly strings. | `tsc`; 403 → "You do not have access" (SOFT) | RESIL-02 |
| **STATE-03** | Bump search generation on close/clear | XS | search-store.ts | `++currentSearchId` in `closeSearch`+`clearResults`. | `tsc`; Esc mid-query → no late results (SOFT) | STATE-01 |
| **STATE-04** | Workspace expand `allSettled`+`contentLoaded` | S | WorkspacesPage.tsx | `contentLoaded` flag gates refetch; `Promise.allSettled` unpacks independently. | `tsc`; dashboards-fail-reports-succeed still lists reports (SOFT) | — |
| **STATE-05** | Non-blocking record-item-open | S | content-store.ts, WorkspacesPage.tsx, SearchDialog.tsx | `Promise.all` for recent/frequent; drop `await` before navigate (fire-and-forget). | nav fires immediately on click (SOFT) | — |
| **STATE-06** | Re-sync settings across viewers *(dependsOn FIXED — antagonist SEQ-4)* | M | settings-store.ts, ReportViewer.tsx, PresentationMode.tsx | Viewers subscribe to `useSettingsStore`; App bootstrap `loadSettings()`. | `tsc`; change interval → open viewer updates without remount (SOFT) | **VIEW-HOOK** |
| **DEP-01** | Vuln remediation *(single-owns the audit re-enable — antagonist SEQ-5)* | L | `package.json`, lockfile, `build.yml` | `audit fix`+overrides; majors only after `tsc`+smoke. **Re-enable is owned by CI-01 (R3), not here** — DEP-01 lands `high=0` and hands the re-enable to CI-01. | `npm audit --audit-level=high` && `tsc` && `package:win` | BUILD-01 |
| **QUAL-03** | Delete dead code | S | ContentTabs.tsx, AppsList.tsx, viewer imports | Delete orphaned components; **leave `constants.ts` to the constants owner**; remove unused `getErrorMessage` *imports* only (export is live via `isTokenExpiredError` — antagonist note). | `tsc -p tsconfig.renderer.json`; `grep ContentTabs\|AppsList` == 0 (HARD) | VIEW-HOOK |
| **TOOL-14** | `comprehensive-review:full-review` = R2 exit gate | S | (Sprint-2 diff) | architect-review approves hook; zero high/critical. | full-review zero high/critical (HARD) | all R2 |

**Sprint 2 exit gate:** R2 HARD+SOFT; cert-slip rule honored.

---

### SPRINT 3 — Quality Net + Long-tail
**Goal:** stand up the regression net, remediate vulns + **re-enable the audit gate (hard)**, close a11y/pagination/validation long-tail.
**Duration:** 5 days (Fri 06-20 → Thu 06-26).
**Exit gate:** R3 HARD+SOFT; no P0/P1 open.

| id | title | effort | files | DoD | verification | dependsOn |
|---|---|---|---|---|---|---|
| **TEST-01** | Vitest + Testing Library harness | S | `vitest.config.ts`, `src/test/setup.ts`, `package.json` | jsdom; `@` alias; typed `window.electronAPI` mock. | `npm run test` exit 0 (placeholder green) | TOOL-01 |
| **TEST-02** | First unit tests (utils, hook, retry) | M | `utils.test.ts`, `usePowerBIEmbed.test.tsx`, `powerbi-api.test.ts` | `report.off`-per-handler on unmount; watchdog via fake timers; 429 Retry-After honored; `partialFailure`. | `npm run test` exit 0; revert `off()` → test red | TEST-01, VIEW-HOOK |
| **TEST-04** | Main + auth-state-machine + Electron smoke | L | `auth-service.test.ts`, `settings-service.test.ts`, `auth-store.test.ts`, `e2e/smoke.spec.ts` | node-env Vitest project; `validateToken` does NOT clear cache; settings clamp; Playwright `_electron.launch` boots to login. | `npm run test` + `npm run test:e2e` exit 0 | TEST-01 |
| **QUAL-01** | ESLint (ts-eslint + react-hooks + no-console) | M | `eslint.config.js`, `package.json` | Flat config; rules-of-hooks=error; exhaustive-deps+no-console=warn→error after fix pass. | `eslint src --max-warnings=0` exit 0 (HARD) | QUAL-03, DX-01 |
| **DX-02** | `noUnusedLocals`/`noUnusedParameters` | S | 3 tsconfigs | Both flags true; `_`-prefix escape. | `tsc -p main && -p renderer` exit 0 | QUAL-03, VIEW-HOOK |
| **DX-04** | Pre-commit lint+typecheck hook | S | `.claude/settings.json` | `update-config` PostToolUse eslint+tsc; simple-git-hooks + lint-staged. | staged lint error → commit rejected (HARD) | QUAL-01 |
| **CI-01** | PR CI lane + **re-enable audit gate (hard, single owner)** | S | `.github/workflows/ci.yml`, `.nvmrc` | New `pull_request` lane: `tsc`+`lint`+`test`; `.nvmrc` node 20; **re-enable audit as hard gate (the DEP-01 handoff)**. | throwaway PR with lint error → CI red; clean PR green (HARD) | QUAL-01, TEST-01, DEP-01 |
| **API-03** | Search fan-out scaling spike+impl | L | `powerbi-api.ts`, search-store.ts, SearchDialog.tsx | Owner ratifies A/B/C; bounded pool + 429-aware; virtualize results. | perf profile: bounded concurrency; `tsc` | RESIL-02, STATE-01 |
| **A11Y-01 / TOOL-13** | Focus trap + ARIA in presentation/dialogs | M | PresentationMode.tsx, ReportViewer.tsx, SearchDialog.tsx | Real focus trap; `aria-label` on icon controls; `role=alert` on errors. | `accessibility-audit` no WCAG A/AA blockers (SOFT/HARD per skill) | VIEW-HOOK |

**Plus long-tail backlog pulls** (input validation on `settings:update`/`usage:record-open`; per-route error boundaries; HiDPI export DPI; IPC channel const map + typed `IPCResponse<T>`; list virtualization >100; `inline-prop-literals-rerenders`; `zero-visible-pages-stuck`; `presentation-bookmark-apply-swallowed`; `export-fallback-leaves-panes-hidden-on-throw`) — see Backlog §8.

---

### BACKLOG
Findings deferred with rationale in §8. Key items: signing-hardening beyond R2; full search server-side strategy (API-03 if A chosen); virtualization >1000; export path validation; presentation low-severity polish.

---

## 5. Dependency Graph & Parallel Work Streams

**Serialized spine (true dependencies — nothing else waits on these):**
```
PRE-0 (commit WIP) ─▶ PRE-1 (inventory hooks/utils) ─▶ PRE-2 (worktree guard)
        │
        ├─▶ BUILD-01 ─▶ TOOL-04 ─▶ BUILD-05 (CI → downloadable GitHub Release)   (distribution)
        │         BUILD-02 (electron-log dep) ─▶ TELEM-01 (logger / telemetry)
        ├─▶ AUTH-01 ─▶ AUTH-05 ─▶ AUTH-06        (getAccessToken evolution, ONE owner)
        ├─▶ VIEW-01 ─▶ VIEW-02 ─▶ VIEW-HOOK ─▶ {REFRESH-01, STATE-06, DX-02, A11Y-01, HEAP-HARNESS}
        ├─▶ RESIL-01 ─▶ RESIL-02 ─▶ {RESIL-03, API-01, API-02, REFRESH-02, API-03}   (powerbi-api sub-stream, ONE owner)
        └─▶ QUAL-01 ─▶ {DX-02, DX-04, CI-01}
DEP-01 (high=0) ─────────────────────────────▶ CI-01 (re-enable audit gate, single owner)
```

**Swimlanes — what runs CONCURRENTLY (maximum agents in tandem):**

| Lane | Owner / agent | Files (disjoint) | Runs concurrent with |
|---|---|---|---|
| **A — build-infra** | build agent | `build.yml`, `electron-builder.yml`, `package.json` (build keys) | B, C, D, E |
| **B — main security** | **single `index.ts` owner** + auth owner | `index.ts`, `auth-service.ts`, `index.html`, `usage-tracking-service.ts` | A, C, D, E |
| **C — viewer-embed** | viewer-core agent (**internally serial**) | 3 viewer `.tsx` | A, B, D, E |
| **D — state/api** | state agent + **powerbi-api sub-stream owner** | stores, `powerbi-api.ts`, `WorkspacesPage.tsx` | A, B, C, E |
| **E — quality/process** | quality agent | `eslint.config.js`, `vitest.config.ts`, `.claude/settings.json` | A, B, C, D |

**What truly serializes (and why):**
- `usePowerBIEmbed` (VIEW-HOOK) **before** STATE-06, REFRESH-01, A11Y-01, DX-02, viewer tests — they consume or rewrite the hook's files.
- CSP/audit-gate + CI `release` job (BUILD-05) **before** any build can be downloaded from GitHub Releases.
- `getAccessToken` chain AUTH-01→05→06 under one owner.
- powerbi-api sub-stream RESIL-01→02→03/API-* under one owner (single worktree, **not** concurrent file-mutators).
- ESLint promote-to-error / `noUnusedLocals` **after** dead-code + console cleanup (else every PR red).
- `/security-review` (S0) and `full-review` (S1/S2) are **convergence gates** — all lanes merge first.

**Single-owner assignments (antagonist FP-1/2/3 — the cross-stream discipline the original missed):** `index.ts` (one owner, full effort) · `auth-service.ts` (one) · `powerbi-api.ts` (one) · `constants.ts` (one) · `auth-store.ts` (one) · `search-store.ts` (one) · `SearchDialog.tsx` (one).

**Merged duplicate tasks:** BUILD-04+TEL-01+TOOL-12 → **TELEM-01**; VIEW-HOOK+QUAL-02 → **one hook task**; DX-01+VIEW-05 → **one console-strip task** (reconcile real vite config path on disk).

**Agent-team vs fan-out:** use `TeamCreate` (cross-check) **only** for the CSP+auth coupled diff (TOOL-03). Everything else is disjoint `Agent`/`Workflow` fan-out with worktree isolation. Do not collapse the two patterns.

---

## 6. Claude Code Tooling Playbook

| Capability | Where in the plan | Why |
|---|---|---|
| **Context7 / query-docs** | Start of BUILD-05 (electron-builder release config), AUTH-01/03/05 (msal-node prompt, clearStorageData, expiresOn), VIEW-01/02/HOOK (powerbi-client `off`/`reset`), TEST-01 (vitest) | The exact APIs the older model got wrong (fabricated expiry, wrong session). Library names only cross the MCP boundary — no PHI. |
| **Workflow fan-out + EnterWorktree** | TOOL-02, Sprint 0 Lanes A–E | Run non-contingent streams in tandem in isolated worktrees off the **post-PRE-0** tip. |
| **TeamCreate agent team** | TOOL-03 (CSP+auth diff only) | Coupled token/CSP findings cross-flagged by 3 audit dimensions; specialists must reconcile, not fan out. Time-boxed. |
| **/security-review** | Sprint 0 hard exit gate (TOOL-05) on merged diff; auth/signing slices in S1/S2 | No security regression ships to 20 users on an unsigned build. |
| **/code-review (--fix)** | Per-lane pre-merge (TOOL-06); every story diff (DoD) | Catch correctness + cross-viewer drift before merge; keep reviewable per-stream commits. |
| **/simplify** | Per-lane quality cleanup | Quality-only (dead handlers, magic numbers); never bug-hunting (that's /code-review). |
| **/verify + /run** | VIEW-01/02/03, AUTH-01/02/03, STATE-* SOFT gates; packaged build for CSP/updater | Behavioral proof in the live app; packaged build (dev hides CSP/updater behavior). |
| **comprehensive-review:full-review** | R1 (TOOL-14) + R2 exit gates | The first feature release / signing release needs multi-dimension grading (code+security+arch+perf+test). |
| **application-performance (perf-optimization / observability)** | HEAP-HARNESS (R1), TELEM-01 | Deterministic heap assertion (not subjective DevTools judgment); electron-log sink design with redaction. |
| **unit-testing:test-automator / debugger** | TEST-02/04 (R3) | Build the embed-hook smoke test + retry/auth tests once the hook + fixes exist. |
| **ui-design:accessibility-audit** | A11Y-01 (R3), Sprint 3 exit | WCAG gate on presentation mode after focus model corrected. |
| **update-config hooks** | TOOL-08 (S0, warn-only) → DX-04 (R3, blocking) | Convert "no lint gate" into enforced DoD; harness runs hooks, not the model. |
| **observability (electron-log)** | TELEM-01 (R1) | Bugs arrive as attachable logs; local-disk under BAA, **no auto-ship of PHI-adjacent data**. |

---

## 7. Definition of Done & CI Gates

**Global DoD (every story):**
1. `tsc --noEmit` clean for main + renderer (strict baseline never regresses).
2. ESLint clean on changed files (from R3 enforced by pre-commit; pre-R3 run manually; warn-only in S0).
3. Verified by **behavior** via `/verify`/`/run` — packaged build for any packaging/CSP/installer change.
4. `/code-review` (medium+) clean or findings waived with rationale; security-touching diffs also pass `/security-review`.
5. No new infinite-spinner / silent-swallow path: every async/embed/fetch path has timeout + visible error + retry.
6. Resource hygiene: every listener/handler/interval/timeout paired with cleanup on unmount.
7. No regression in headline verified fixes (CSP-on-partition, watchdog, cache-nuke removal, select_account, slideshow, handler detach, focus guard).
8. Each story links its finding ID(s); finding moved to resolved with verifying command/output.
9. User-facing copy is human, not raw error JSON.
10. Ships only as a CI-produced installer attached to a GitHub Release for download — never a hand-built local artifact.
11. Docs/memory updated **same session** (CLAUDE.md, click-through/rollback guide, changed constants).

**Gate-tiering rule (antagonist §5):** every sprint exit gate is split into **HARD (exit-0 command)** and **SOFT (human-confirmed)**. R0 #4/#8 are SOFT (manual until R1 heap harness / R3 tests). A failed SOFT check is logged and blocks; it is never assumed by a green `tsc`.

**CI pipeline the plan builds toward:**
- **R0:** tag-triggered `build.yml`, audit report-only (`continue-on-error`), mac decoupled, Windows produces installer. Proven via `workflow_dispatch` before tagging.
- **R1–R2:** `build.yml` `release` job attaches the installer to a GitHub Release for download; version-bump gate (R2); signing (R2).
- **R3:** new `ci.yml` on `pull_request` + push-to-main running `tsc` + `eslint --max-warnings=0` + `vitest run` as **required checks**; audit gate **re-enabled as hard** (single owner: CI-01, fed by DEP-01 `high=0`). Playwright `_electron` smoke runs in the release workflow, not the PR lane.

---

## 8. Traceability Matrix

> The PO's "every finding mapped to exactly one epic" claim was **false at the task level** (antagonist §1). Below: every finding → task → sprint. **Orphans now mapped or explicitly dispositioned.**

**P0 — Sprint 0**
| Finding | Task | Sprint |
|---|---|---|
| ci-npm-audit-blocks-release | BUILD-01, TOOL-04 | S0 |
| ci-mac-build-unsigned-unnotarized | BUILD-01 (decouple) / BUILD-05 (S1) | S0/S1 |
| csp-only-on-default-session | SEC-01 | S0 |
| csp-unsafe-inline-style-and-weak-directives | SEC-01 | S0 |
| access-token-exposed-to-renderer | SEC-01 (CSP confines) | S0 |
| main-window-no-window-open-handler | SEC-03 | S0 |
| no-single-instance-lock | SEC-02 | S0 |
| **usage-store-read-throws-unhandled** *(pulled forward)* | **USAGE-01** | **S0** |
| interaction-required-nukes-cache | AUTH-01 | S0 |
| validatetoken-blanks-account-no-reauth-prompt | AUTH-01 | S0 |
| checkauth-no-error-surface | AUTH-01 | S0 |
| logout-no-aad-session-clear (select-account half) | AUTH-02 | S0 |
| multi-account-always-zero (mitigant) | AUTH-02 | S0 |
| report-viewer-swallows-all-errors | VIEW-01 | S0 |
| report-embed-spinner-forever | VIEW-01 | S0 |
| pbi-embed-not-destroyed | VIEW-02 | S0 |
| focus-reclaim-interval-thrash | VIEW-03 | S0 |
| slideshow-interval-range-drift / -contradiction | VIEW-07 | S0 |
| unsigned-installer-smartscreen (stopgap) | DIST-01 | S0 (signing R2) |
| no-auto-update-mechanism | **WONTFIX by decision** — distribution is manual GitHub download; DIST-01 install/rollback guide. Unsigned auto-update is unreliable. | S0 |

**P0/P1 — Sprint 1**
| Finding | Task | Sprint |
|---|---|---|
| no-auto-update-mechanism (downloadable release path) | BUILD-05 (CI → GitHub Release) | S1 |
| no-crash-reporting-telemetry | TELEM-01 | S1 |
| errors-swallowed-to-console | TELEM-01 | S1 |
| global-rejection-handlers-no-renderer | TELEM-01 | S1 |
| raw-error-strings-to-users (mapper) | TELEM-01 / API-02 (S2) | S1/S2 |
| logout-no-aad-session-clear (session half) | AUTH-03 | S1 |
| embed-token-misnomer / fabricated-token-expiration | AUTH-05 | S1 |
| **no-proactive-refresh-while-visible** *(pulled forward, kiosk)* | **REFRESH-01** | **S1** |
| **dataset-refresh-info-success-on-failure** *(pulled forward)* | **REFRESH-02** | **S1** |
| webview-not-torn-down | VIEW-04 | S1 |
| viewer-massive-duplication / token-refresh-divergence | VIEW-HOOK | S1 |
| isloadingref-not-reembed-guard | VIEW-HOOK (generation counter) | S1 |
| no-fetch-timeout | RESIL-01 | S1 |
| no-retry-transient / no-429-rate-limit-handling | RESIL-02 | S1 |
| getallitems-swallows-partial-failures | RESIL-03 | S1 |
| content-store-maps-never-evict / search-cache-module-global | STATE-01 | S1 |
| search-cache-never-invalidated | STATE-02 | S1 |
| settings-not-reloaded-across-components | VIEW-HOOK owns / STATE-06 (S2) | S1/S2 |

**P2 — Sprint 2**
| Finding | Task |
|---|---|
| reportviewer-debug-logging-in-prod / debug-logging-on-hot-events | DX-01 |
| auth-window-no-timeout / no-sandbox-no-state-check | AUTH-04 |
| token-refresh-race-no-lock | AUTH-06 |
| state-stored-as-instance-field (CSRF UX) | AUTH-07 |
| app-reports-no-pagination | API-01 |
| raw-error-strings-to-users (table) | API-02 |
| search-results-render-after-close-or-clear | STATE-03 |
| workspace-empty-refetch-and-partial-failure | STATE-04 |
| record-item-opened-serial-awaits-blocks-navigation / record-item-double-refetch | STATE-05 |
| settings-not-reloaded-across-components | STATE-06 |
| 27-npm-audit-vulns / ci-npm-audit-blocks-release (close) | DEP-01 → CI-01 |
| dead-components-and-exports / magic-numbers-and-timeouts | QUAL-03 |
| no-version-bump-automation | BUILD-06 |
| asar-bakes-azure-config / unsigned-installer (full) | DIST-02 |

**P2/P3 — Sprint 3**
| Finding | Task |
|---|---|
| no-eslint-no-tests | QUAL-01, TEST-01/02/04, DX-02/04, CI-01 |
| settings-update-no-validation / usage-record-no-validation | R3 long-tail |
| no-lockfile-determinism-guard | CI-01 (`.nvmrc`) + PRE-0 |
| brittle-token-expired | TEST-02 |
| presentation-no-focus-trap-a11y / focus thrash a11y | A11Y-01 |
| getallitems-fanout-scaling / thousands-of-items-no-virtualization | API-03 |
| **inline-prop-literals-rerenders** *(was orphan)* | R3 long-tail (memoize props) |
| **zero-visible-pages-stuck** *(was orphan)* | R3 long-tail (presentation guard) |
| **presentation-bookmark-apply-swallowed** *(was orphan)* | R3 long-tail |
| **export-fallback-leaves-panes-hidden-on-throw** *(was orphan)* | R3 long-tail (finally-restore panes) |
| **auto-refresh-races-token-refresh** *(was orphan)* | R3 long-tail (serialize in hook) |
| presentation-mousemove-dual-listener-redundant-timer | A11Y-01 / R3 |
| aggressive-autorefresh-default | folded into VIEW-HOOK default (S1) |

**Intentionally DEFERRED to Backlog (explicit disposition — antagonist §1 "log, don't silently drop"):**
| Finding | Severity | Why deferred |
|---|---|---|
| export-feature-detection-string-match | low | Cosmetic; no day-one impact. |
| single-page-fullscreen-no-hint | low | Minor UX hint; not a freeze. |
| presentation-exit-double-navigate | low | Benign double-nav; no data effect. |
| export-writefile-no-dir-guard | low | Export is non-critical path; guard in R3 long-tail if capacity. |
| current-view-pdf-data-url-window / export-current-view-bounds-unvalidated | low | Export hardening; R3/backlog. |
| **embedded-config-and-redirect-localhost (CRLF `.env` parse)** | — | **Antagonist flagged the dangling risk note.** Disposition: **verify on disk in R3**; if `generate-config.js` parse breaks AAD redirect on CRLF, fix in R3 (one-line); if non-issue, prove and close. Not left as a bare risk note. |
| safestorage-unavailable-save-loop, strictmode-isloadingref-permanent-blank, shared-singleton-service-cross-viewer-reset | — | **Refuted false-positives** — excluded from scope by design. |

---

## 9. Risk Register & Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Dirty WIP corrupts worktree fan-out** | High (verified) | Catastrophic | **PRE-0** commit + `git status --short` empty gate before any worktree. |
| **Half-built `hooks/`/`utils.ts` derail refactor** | High (verified) | High | **PRE-1** read-only inventory; reconcile into VIEW-HOOK before refactor. |
| **`index.ts` 5-way concurrent write** | High | High | **Single owner** for `index.ts`; merged telemetry task (no autoUpdater task). |
| **Bad unsigned Monday build, no rollback** | Medium | Critical | See RB plan below. |
| **CSP breaks embeds in packaged build (invisible in dev)** | Medium | High | SEC-01 verified packaged; TeamCreate cross-check; pilot rollout catches before the other 17. |
| **Users don't notice a new release** | Medium | Medium | Operator notifies all 20 (email/Teams) on each GitHub Release; install guide bookmarked; in-app version shown in Settings so users can self-check. |
| **Concurrent persistCache race live R0/R1** | Low | Medium | Acknowledged residual; closed by AUTH-06 (R2). |
| **27 vulns shipped in asar Monday** | Certain | Medium | Accepted Monday tradeoff; DEP-01 (R2) → CI-01 re-enable (R3). |
| **Manual SOFT gates not exit-0** | High | Medium | Gate-tiering; heap harness (R1) + tests (R3) convert SOFT→HARD over time. |

**Rollback / staged-rollout (manual GitHub-download model):**
1. **Staged/canary rollout:** announce each new release to **2–3 pilot users first**; widen to the other 17 only after the pilots confirm a clean download + install + smoke. Because distribution is pull-not-push, no bad build reaches everyone at once.
2. **Manual-reinstall rollback:** the prior release stays on the GitHub Releases page. DIST-01's guide doubles as a rollback guide — if a new build misbehaves, users download the **previous known-good installer (SHA-256 pinned)** and reinstall.
3. **Bad-build containment:** a bad build only affects users who chose to download it. Mark the bad Release as a **draft / delete it / edit the notes to "do not install"** and point users back to the prior Release — no per-machine un-pushing needed (nothing auto-installed).

---

## 10. Ceremonies & Cadence (AI-agent team)

- **Sprint Planning (sprint start; S0 = Saturday kickoff):** `Plan`+`Explore` confirm finding file:line on disk **against the dirty-then-committed tree** (line numbers decay). Context7 fetches sprint libraries up front. `TaskCreate`/`TaskList` build the shared backlog; the Scrum Master plans the dependency graph so non-contingent work fans out and only real dependencies serialize. **PRE-0/1/2 are planning prerequisites, not stories to be parallelized.**
- **Daily Standup (control-return sync — no wall clock):** on each return of control, `TaskList`/`TaskGet` read the board; reassign stalled, re-dispatch unblocked. `SendMessage` reconciles the CSP/auth agent team. `EnterWorktree` isolation keeps file-mutating agents from colliding — enforced by the single-owner table in §5.
- **Per-Task Verification Gate (every completion):** `/verify`/`/run` (packaged build for CSP/updater); `/code-review --fix`; `/security-review` for security diffs; heap harness for perf; tests from R3. **HARD vs SOFT labeling is mandatory** — a SOFT check is logged human-confirmed, never assumed.
- **Sprint Review (exit gate, command exits 0):** `/security-review` = S0 hard gate on merged diff; `comprehensive-review:full-review` = S1/S2; `accessibility-audit` = S3. Reviewer grades against spec; never the implementer's self-report; never advance past a failed gate.
- **Sprint Retrospective:** cross-flagging is signal — when multiple review agents surface the same issue, elevate it. `update-config` applies process fixes (pre-commit hook after S0 proved un-linted dispatches regress; tighten settings.json). Archive shipped-sprint docs immediately; update CLAUDE.md/memory same session (doc rot = incomplete story).

---

**End of plan.** The planning-integrity invariants: (1) commit WIP before worktrees; (2) reconcile existing untracked hooks/utils; (3) distribution is manual download from GitHub Releases — **no auto-update** (unsigned makes it unreliable); each release is a CI-built installer attached to a Release; (4) staged rollout to pilots + manual-reinstall rollback (prior installer stays on GitHub); (5) one owner per contended file across streams; (6) merged duplicate tasks (telemetry ×3, hook ×2, console-strip ×2); (7) all orphaned findings mapped or explicitly dispositioned; (8) every exit gate split into HARD exit-0 vs SOFT human-confirmed.
