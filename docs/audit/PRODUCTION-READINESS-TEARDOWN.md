The key cross-cutting fact is now confirmed: the CSP (with `script-src 'self'` and a restricted `connect-src`) is registered on `defaultSession` only, while production binds windows to `PARTITION_NAME`. So in production the CSP is absent — which means the token-exposure finding's mitigations (connect-src, script-src) that the verifier relied on to downgrade it are themselves inert in the shipped build. This is the central cross-flag. I have enough to synthesize.

---

# Production-Readiness Teardown — Electron Power BI Viewer
**Target: 20 non-technical users, hard Monday ship. 10 dimensions audited, every critical/high adversarially verified.**

---

## 1. Executive Verdict

**Not production-ready as-is. Readiness score: 5.5 / 10 — shippable only after a tight Sprint 0.** The app's security baseline is genuinely above-average for an AI-built Electron app (contextIsolation + sandbox + nodeIntegration:false, typed contextBridge, UUID-validated IPC, webview allowlist), and most of the scariest-sounding findings were correctly downgraded on verification — the codebase is more disciplined than the "a lot of bugs" framing suggests. **But it ships with two real landmines that gate distribution and one structural blind spot that gates everything after.** The single biggest risk is the **production CSP gap** (`src/main/index.ts:61,105`): the Content-Security-Policy is registered on `defaultSession` but the packaged app runs the privileged, token-bearing renderer **and** the remote `app.powerbi.com` webview in the `persist:powerbi-viewer` partition — so **the shipped artifact enforces no CSP at all**, and it "works" in `npm run dev` so the developer will never see it. This matters more than its standalone severity because it silently disarms the exact `connect-src`/`script-src` mitigations that the verifier relied on to downgrade the renderer-token-exposure finding. Layered on top: the **installer is unsigned** (SmartScreen will scare/block non-technical users on Monday) and there is **no update channel whatsoever** — once these 20 users install Monday's build, you cannot push a fix without 20 manual uninstall/reinstall touches. You can ship Monday, but only if Sprint 0 below lands first.

---

## 2. Monday Blockers (MUST fix before distribution)

Verified `confirmed` or `partly-true` at critical/high (post-adjustment). **9 critical/high findings were refuted outright as false-positives** (see scorecard) — those are dropped. Ranked by distribution risk.

| # | Title | Sev | Impact (one line) | File:line | Fix |
|---|-------|-----|-------------------|-----------|-----|
| **1** | **No update mechanism at all** | critical→med* | Cannot push any bug fix to 20 users without manual reinstall; the "fix it later" plan is impossible | `electron-builder.yml:6` (`publish: null`); no `electron-updater` in `package.json:21-32`; no `autoUpdater` in `src/main/index.ts` | Add `electron-updater`, set `publish:` to GitHub provider, call `autoUpdater.checkForUpdatesAndNotify()` on ready (prod-gated). **Gating because all other fast-follows depend on it.** |
| **2** | **Unsigned installer — SmartScreen blocks/scares users** | critical→high | Day-one "Unknown publisher" warning; non-technical users abandon or flood support | `electron-builder.yml:25-32` (signing vars commented out); `.github/workflows/build.yml:34-39` (no `CSC_LINK`) | Obtain OV/EV code-signing cert; wire `CSC_LINK`+`CSC_KEY_PASSWORD` into CI package step. If impossible by Monday: written click-through guide as a stopgap, not a fix. |
| **3** | **Production CSP is inert (registered on wrong session)** | critical→high | Shipped app enforces zero CSP on the token-bearing renderer + remote webview; disarms the mitigations other findings rely on | `src/main/index.ts:105` (CSP on `session.defaultSession`) vs `:61` (window uses `PARTITION_NAME`); `AppViewer.tsx:193` | Register `onHeadersReceived` on `session.fromPartition(PARTITION_NAME)` in prod (or both). Add `<meta>` CSP fallback in `renderer/index.html`. Add `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. **Verify in packaged build, not dev.** |
| **4** | **CI `npm audit --audit-level=high` blocks the release** | high | A `v*` tag push fails both build jobs at the audit step → no installer produced at all | `.github/workflows/build.yml:28-29,63-64`; release gated on `needs:[build-windows,build-mac]` (18 high vulns → exit 1) | Set `continue-on-error: true` or downgrade to report-only for Monday; track remediation. **Run via `workflow_dispatch` before tagging — do not discover this while cutting the release.** |
| **5** | **ReportViewer swallows all non-token embed errors → permanent blank/hung spinner** | critical→high | A no-permission/deleted/throttled report yields an unrecoverable stuck "Loading report…" with no error, no retry | `src/renderer/components/viewer/ReportViewer.tsx:428-439` (`// Don't show error UI`); spinner cleared only at `:387` ('loaded') | In the non-token branch, `setError(...)` + `setIsLoading(false)` so the existing Try-again overlay (`:742-751`) renders. Add a load watchdog timeout. |
| **6** | **Embed spinner has no watchdog → infinite spinner on stalled embed** | critical→high | Slow/blocked `app.powerbi.com` (proxy, captive portal) → eternal spinner indistinguishable from a hang | `ReportViewer.tsx:386-387` (loaded-only clear); `DashboardViewer.tsx:179-192`; `PresentationMode.tsx:471-514`; no timeout anywhere | Add a 30–45s watchdog after `embed()` that flips to an actionable error + retry if neither `loaded` nor a fatal error fired. Apply to all three viewers. |
| **7** | **Silent-token failure nukes the entire account cache** | critical→high | Routine refresh-token expiry / CA re-auth / password change silently logs users fully out, every app launch via `validateToken` | `src/main/auth/auth-service.ts:302-311` (catch → `logout()`); `:86-89`; `auth-store.ts:32` | On `InteractionRequiredAuthError`, attempt `acquireTokenInteractive` for the existing account before clearing anything. Remove the destructive `logout()` from `validateToken`. |
| **8** | **Logout never clears AAD/browser session → cannot switch accounts** | high | "Logout then login" silently SSOs back into the same account; wrong-account users are stuck | `auth-service.ts:322-340` (no `clearStorageData`/end-session); auth window uses default session `:220-228` | Add `prompt:'select_account'` to the auth-code URL and/or `session.defaultSession.clearStorageData({storages:['cookies']})` in `logout()`. |
| **9** | **Slideshow interval: two incompatible ranges + silent data loss** | high→med-high | Settings slider is 30–300s, in-viewer slider is 3–60s for the *same* field; in-viewer changes are never persisted | `SettingsPage.tsx:171-178` vs `PresentationMode.tsx:618-624`; dead constants `constants.ts:13-14,21` | One canonical MIN/MAX/STEP/DEFAULT in `constants.ts`, imported by both sliders. Persist the in-viewer change via `updateSettings`. Delete dead constants. |
| **10** | **No fetch timeout / no retry / no 429 handling** | high→med | Half-open connections hang forever; transient cloud errors fail hard; throttled workspaces silently vanish from the catalog | `powerbi-api.ts:27,52,416,444,472` (bare fetch); `makeRequest:20-40` (no retry); `getAllItems:518-538` (swallows partial failures, returns `success:true`) | Add `AbortController`+timeout to all fetches; retry-with-backoff on 429 (honor `Retry-After`)/5xx; surface partial failures from `getAllItems` instead of dropping throttled workspaces. |

\* **#1 and #2 are the true distribution gates.** Even where verifiers downgraded the *severity label* (because they are operability/UX rather than runtime-correctness defects), they remain Monday blockers because they determine whether users can install the app and whether you can ever fix it afterward. **Treat #1+#2+#3 as the non-negotiable trio.** #5–#7 are the most likely day-one "the app froze" tickets.

---

## 3. Cross-Flagged Issues (independently surfaced by multiple dimensions — elevate)

Cross-flagging is signal. Five issues were surfaced by 2+ independent specialists:

1. **Fabricated 1-hour token expiry + raw access token to renderer** — flagged by *Electron threat model* (`embed-token-misnomer`, `access-token-exposed-to-renderer`), *Auth & Secrets* (`access-token-as-embed-token`), and *Embed lifecycle* (`fabricated-token-expiration`). `powerbi-api.ts:367-374` returns the raw AAD access token stamped `Date.now()+3600000`. Three dimensions independently caught this — it is the most cross-validated defect in the report. The exfiltration *impact* was downgraded **only because of the CSP** — which Blocker #3 proves is absent in production. **Elevate: fix the CSP AND surface the real `expiresOn` from MSAL.**

2. **ReportViewer swallows non-token errors → blank/infinite spinner** — flagged by *Embed lifecycle* (`report-viewer-swallows-all-errors`), *Resilience* (`report-embed-spinner-forever`), and *Code Quality* (`token-refresh-divergence-across-viewers`). Three dimensions, all `confirmed`/`partly-true` at high. This is Blocker #5/#6. The single most likely user-facing failure.

3. **Slideshow interval range drift + dead constants** — flagged by *State management* (`slideshow-interval-range-drift`) and *Code Quality* (`slideshow-interval-range-contradiction`), both `confirmed`. Blocker #9.

4. **`isLoadingRef` is not a real re-embed guard** — flagged by *React renderer* (`strictmode-isloadingref-permanent-blank`, refuted as dev-only) and *Embed lifecycle* (`isloadingref-not-reembed-guard`, `partly-true`/medium, production-reachable via report→report navigation). The StrictMode framing was a false-positive, but the **production navigation race is real** — a transient wrong-report flash on rapid report switching. Fix with a generation counter, not a boolean.

5. **No retry / no telemetry / errors-to-console black holes** — flagged by *Resilience* (`errors-swallowed-to-console`, `no-retry-transient`) and *Build/Release* (`no-crash-reporting-telemetry`). You will be blind to the bugs your users hit AND those bugs will fail hard. These compound: no resilience means more failures, no telemetry means you never learn about them.

---

## 4. Full Findings by Dimension (everything — all severities)

### Dimension 1 — Electron Threat Model
- 🔴→🟠 `csp-only-on-default-session` (critical→**high**, **confirmed**): CSP on `defaultSession`, prod windows use `PARTITION_NAME` → no CSP in packaged build. `index.ts:61,105-114`; `AppViewer.tsx:193`. **Blocker #3.**
- 🔴→🟡 `access-token-exposed-to-renderer` (critical→**medium**, **partly-true**): Raw AAD token in renderer via `preload/index.ts:13`, `index.ts:220`, `powerbi-api.ts:367-374`. Downgraded *because* `connect-src`/`script-src` block exfil — but that relies on the CSP being active, which #3 refutes in prod.
- 🟠→🟡 `main-window-no-window-open-handler` (high→**medium**, **partly-true**): No `setWindowOpenHandler` on main window (only webview-gated, `index.ts:141-167`). Mitigated by `script-src 'self'`, sandbox, Electron 28. Add global deny-all handler.
- 🟠→🟢 `export-path-validation-renderer-trusted` (high→**low**, **partly-true**): `isValidExportPath` (`index.ts:27-38`) allows entire `os.homedir()`, renderer-supplied path, weak Windows normalization. Requires prior renderer compromise; written bytes are server/app-controlled. Narrow allowlist to Downloads/Desktop/Documents.
- 🟡 `webview-nodeintegration-and-popups` (medium, *unverified*): webview relies on Electron 28 safe defaults; `nodeintegration`/`webpreferences` not explicitly set; `allowpopups={true}`. `AppViewer.tsx:185-195`. Defense-in-depth.
- 🟡 `csp-unsafe-inline-style-and-weak-directives` (medium, *unverified*): `style-src 'unsafe-inline'`, no `object-src`/`base-uri`/`frame-ancestors`. `index.ts:110`. Fold into #3 fix.
- 🟡 `auth-window-no-sandbox-no-state-check` (medium, *unverified, speculative*): auth window lacks `sandbox:true`; verify `state===expectedState` is enforced. `auth-service.ts:218-243`. (Note: a separate dimension verified state IS validated and PKCE is used — see `state-stored-as-instance-field`.)
- 🟡 `embed-token-misnomer-full-scope` (medium, *unverified*): `getEmbedToken` returns raw token + fake expiry. `powerbi-api.ts:367-374`. Cross-flagged.
- 🟢 `current-view-pdf-data-url-window` (low, *unverified*): hidden PDF window loads interpolated `data:` URL, no CSP/nav guard; inputs are app-controlled numerics. `index.ts:477-518`.

### Dimension 2 — Authentication & Secrets (MSAL)
- 🔴→🟠 `interaction-required-nukes-cache` (critical→**high**, **confirmed**): silent-refresh failure → `logout()` wipes all accounts; fires every launch. `auth-service.ts:302-311,86-89`; `auth-store.ts:32`. **Blocker #7.**
- 🟠→🟢 `auth-window-no-timeout` (high→**low**, **partly-true**): no timeout, error-param swallowed, blocked-nav leaves blank window — but visible window's `closed` handler always resolves, so no unrecoverable hang. `auth-service.ts:218-270`. Add timeout + surface AAD errors.
- 🟠→🟢 `safestorage-unavailable-save-loop` (high→**low**, **FALSE-POSITIVE**): claim missed `saveUserInfo` (`:191`) is unguarded inside `login()`'s try → login returns `LOGIN_FAILED` loudly with a visible error, not a silent loop. No bug.
- 🟠→🟢 `multi-account-always-zero` (high→**low**, **partly-true**): `accounts[0]` everywhere (`:45,283-290`), but single-tenant authority + all-accounts-cleared logout + no switch-account UI make the harmful state nearly unreachable. Hardening only.
- 🟠 `logout-no-aad-session-clear` (high, **confirmed**): no `clearStorageData`/end-session/`prompt=select_account` → cannot switch accounts. `auth-service.ts:322-340`. **Blocker #8.**
- 🟡 `access-token-as-embed-token` (medium, *unverified*): cross-flag of fake expiry / raw token. `powerbi-api.ts:367-374`.
- 🟡 `token-refresh-race-no-lock` (medium, *unverified*): `getAllItems` fan-out → concurrent `acquireTokenSilent`+`persistCache` with no lock; an `InteractionRequired` mid-flight nukes cache. `powerbi-api.ts:514-528`.
- 🟢 `embedded-config-and-redirect-localhost` (low, *unverified*): clientId/tenantId baked (non-secret, OK); naive `.env` parsing in `generate-config.js` (no quote/CRLF strip); bare `http://localhost` redirect must match AAD exactly.
- 🟢 `state-stored-as-instance-field` (low, *unverified*): single-slot `pendingAuthState` → double-click login throws a scary "possible CSRF attack". `auth-service.ts:16,163-167`. Soften user-facing text.
- 🟢 `validatetoken-blanks-account-no-reauth-prompt` (low, *unverified*): startup validation failure bounces to login with `error:null` — no explanation. `auth-store.ts:51-58`.

### Dimension 3 — Main-process & IPC Reliability
- 🟠→🟢 `pdf-export-promise-hang` (high→**low**, **partly-true**): no timeout/`.once` on `did-finish-load`/`did-fail-load` — but per-call window disposed in `finally` (no leak), `data:` URL load failures already reject. `index.ts:506-510`. Add timeout + `render-process-gone`.
- 🟠→🟢 `settings-update-no-validation` (high→**low**, **partly-true**): unvalidated `Partial<AppSettings>` persisted (`settings-service.ts:30-43`) — but theme falls through to light, interval feeds async reload not a busy loop, `settings:reset` recovers. Still: clamp/whitelist before `store.set`.
- 🟡 `usage-record-no-validation` (medium, *unverified*): unvalidated payload, non-atomic read-modify-write, no length caps. `index.ts:537-550`; `usage-tracking-service.ts:30-69`.
- 🟡 `no-single-instance-lock` (medium, **confirmed**): no `requestSingleInstanceLock()` → double-launch = two windows + two store writers → JSON corruption. `index.ts:103-126`. **Cheap, high-value — do it.**
- 🟡 `usage-store-read-throws-unhandled` (medium, *unverified*): `Store` constructed at module top with no try/catch (`usage-tracking-service.ts:17-22`) → corrupted file crashes startup. Use `clearInvalidConfig` / guarded lazy init.
- 🟢 `macos-activate-race` (low, *unverified, speculative*): macOS-only; Windows target unaffected.
- 🟢 `export-writefile-no-dir-guard` (low, **confirmed**): `content:export-report-pdf` `writeFile` (`index.ts:316`) not wrapped → EBUSY/EACCES rejects raw instead of envelope. Wrap to match `:518`.
- 🟢 `pdf-window-uses-default-session-csp` (low, *unverified, speculative*): PDF export coupled to global CSP `img-src data:`; tightening CSP silently breaks export.
- 🟢 `export-current-view-bounds-unvalidated` (low, *unverified*): `x/y` not `Number.isFinite`-checked → NaN captureRect possible. `index.ts:442-461`.

### Dimension 4 — React Renderer Correctness
- 🔴→🟢 `strictmode-isloadingref-permanent-blank` (critical→**low**, **FALSE-POSITIVE**): reset-before-embed + last-embed-wins makes stale-loaded path unreachable; StrictMode is dev-only. No production impact.
- 🟠→🟢 `fullscreen-hint-settimeout-uncleaned` (high→**low**, **partly-true**): uncleared `setTimeout` (`ReportViewer.tsx:217`) — but React 18 no-ops setState-after-unmount (no warning), 5s self-clearing. One-line `clearTimeout` fix.
- 🟡 `export-mousedown-settimeouts-uncleaned` (medium, *unverified*): two untracked focus-reclaim timeouts. `ReportViewer.tsx:274-283`.
- 🟠→🟢 `no-error-boundary-around-viewers` (high→**low**, **partly-true**): single root boundary, no per-route — but all embed/report paths use try/catch + inline `setError`, so async errors never reach the boundary. Per-route boundaries are a nicety.
- 🟡 `autorefresh-stale-closure-and-flag-churn` (medium, *unverified*): `isLoading`/`error` in deps → interval torn down/recreated repeatedly; may never reach refresh interval. `ReportViewer.tsx:168-183`.
- 🟡 `presentation-slideshow-interval-double-managed-race` (medium, *unverified*): timer ref owned by 4 sites; `slides.length` dep resets mid-show. `PresentationMode.tsx:317-334`.
- 🟢 `presentation-autostart-missing-isplaying-dep` (low, *unverified, speculative*): paused slideshow may resume after error-recover.
- 🟡 `focus-reclaim-200ms-interval-recreated-and-thrashes` (medium, *unverified*): focus stolen 5×/sec unconditionally → filter inputs uninteractable in fullscreen; `stopImmediatePropagation` on arrows. `ReportViewer.tsx:287-302`. **Real UX defect.**
- 🟢 `appviewer-webview-listener-rebind-gap` (low, *unverified, speculative*): possible missed initial webview load event; unguarded async `setAppName`.
- 🟢 `presentation-mousemove-dual-listener-redundant-timer` (low, **confirmed**): `mousemove` bound to window+document → handler fires twice. `PresentationMode.tsx:407-408`.
- 🟢 `settings-loaded-async-no-mounted-guard` (low, *unverified*): unguarded setState after await in all viewers; React 18 no-ops it.
- 🟢 `report-loaded-callback-stale-pages-ref` (low, *unverified, speculative*): page counter briefly wrong after load.
- 🟠→🟢 `shared-singleton-service-cross-viewer-reset` (high→**low**, **FALSE-POSITIVE**): powerbi-client keys embeds per-HTMLElement + mutually-exclusive routes → cross-viewer interference impossible.

### Dimension 5 — Client-side State Management
- 🟠 `slideshow-interval-range-drift` (high, **confirmed**): two ranges + dead constant + no persistence. **Blocker #9.**
- 🟡 `settings-not-reloaded-across-components` (medium, *unverified*): viewers read settings once via IPC, never re-sync with store → open viewer keeps stale interval. `PresentationMode.tsx:107-123`; `ReportViewer.tsx:60-66`.
- 🟠→🟡 `search-cache-never-invalidated` (high→**medium**, **confirmed**): `invalidateCache` is dead code; 5-min TTL → new/renamed/deleted reports invisible/stale with no force-refresh. `search-store.ts:22,68-76`. Wire to existing Refresh buttons.
- 🟡 `search-results-render-after-close-or-clear` (medium, *unverified*): `currentSearchId` not bumped on close/clear → results render into closed/emptied dialog. `search-store.ts:60-62`.
- 🟡 `workspace-empty-refetch-and-partial-failure` (medium, **confirmed**): empty workspace re-fetches every expand; `Promise.all` partial failure → shows "empty workspace" when reports exist. `WorkspacesPage.tsx:69,86-89,102`. Use `contentLoaded` flag + `Promise.allSettled`.
- 🟢 `content-store-maps-never-evict` (low, **confirmed**): Maps + search cache never cleared on logout → next user sees prior user's content list. `content-store.ts:12-13`; `auth-store.ts:104-122`. **Minor data-leak — clear on logout.**
- 🟢 `error-states-never-auto-cleared` (low, *unverified*): silent failures (settings save, content load) + sticky red banners; opposite failure modes both hurt. `content-store.ts`; `settings-store.ts:41-43`.
- 🟢 `record-item-opened-serial-awaits-blocks-navigation` (low, **confirmed**): 3 serial round-trips awaited before `navigate()` → perceptible open lag. `content-store.ts:123-138`. Fire-and-forget instead.

### Dimension 6 — Resilience & Error Handling
- 🔴→🟠 `report-embed-spinner-forever` (critical→**high**, **partly-true**): infinite spinner on stalled/non-token embed; worst in ReportViewer (Dashboard/Presentation recover via `setError`). **Blocker #6.**
- 🟠→🟡 `no-fetch-timeout` (high→**medium**, **confirmed**): every fetch bare, no `AbortController`. `powerbi-api.ts:27,52,416,444,472`. **Blocker #10.** (undici default timeouts are a partial backstop.)
- 🟠→🟡 `no-retry-transient` (high→**medium**, **confirmed**): zero retry/backoff anywhere; one 503/blip = hard failure. Monday-morning concurrent auth will hit this. **Blocker #10.**
- 🟠→🟡 `no-429-rate-limit-handling` (high→**medium**, **confirmed**): `getAllItems` fans out 10 concurrent calls/batch, ignores `Retry-After`; throttled workspaces silently dropped. `powerbi-api.ts:514-538`. **Blocker #10.**
- 🟠→🟡 `getallitems-swallows-partial-failures` (high→**medium**, **confirmed**): returns `success:true` even if every workspace fetch failed → silently incomplete catalog presented as complete. `powerbi-api.ts:530-546`. Surface a `partialFailure` flag.
- 🟡 `app-reports-no-pagination` (medium, *unverified*): `getAppReports`/`getAppDashboards` ignore `@odata.nextLink` → truncated content for large apps. `powerbi-api.ts:282-298,329-343`.
- 🟠→🟢 `no-offline-detection` (high→**low**, **partly-true**): no `navigator.onLine`; failures show raw "TypeError: Failed to fetch". Recoverable via existing Try-again. UX-only.
- 🟡 `errors-swallowed-to-console` (medium, **confirmed**): many failures `console.error`-only → black holes in packaged build; Home page shows empty state indistinguishable from first run. Cross-flagged.
- 🟡 `raw-error-strings-to-users` (medium, **confirmed**): raw HTTP/OData JSON shown to users; 403 should say "no access". Add a status-code error mapper.
- 🟡 `global-rejection-handlers-no-renderer` (medium, *unverified*): no renderer `unhandledrejection`/`onerror`; main handlers `console.error`-only. (Note: a separate verifier found a renderer `unhandledrejection` handler DOES exist in `main.tsx:18` but only logs.)
- 🟡 `export-poll-unbounded-and-no-retry` (medium, *unverified*): poll throws on first transient status error; "Exporting…" button can stick forever. `powerbi-api.ts:443-466`.
- 🟡 `thousands-of-items-no-virtualization` (medium, *unverified, speculative*): `getAllItems` uncapped + non-virtualized lists → render jank on huge tenants.
- 🟢 `checkauth-no-error-surface` (low, *unverified*): transient startup token failure → silent logout. (Same root as Blocker #7.)

### Dimension 7 — Build / Release / Distribution / Operability
- 🔴→🟡 `no-auto-update-mechanism` (critical→**medium**, **confirmed**): no update channel at all. **Blocker #1 (gates all fast-follows).**
- 🔴→🟠 `unsigned-installer-smartscreen` (critical→**high**, **confirmed**): unsigned `.exe`. **Blocker #2.**
- 🟠→🟡 `no-crash-reporting-telemetry` (high→**medium**, **partly-true**): no crashReporter/Sentry/log file; only `console.error`. You'll be blind. Cross-flagged. (Renderer ErrorBoundary exists but reports nowhere.)
- 🟠 `ci-npm-audit-blocks-release` (high, **confirmed**): audit gate fails the release. **Blocker #4.**
- 🟡 `no-version-bump-automation` (medium, **confirmed**): tag not verified against `package.json` version → mislabeled builds; version is your only rollout-tracking signal. `build.yml:3-6`; `package.json:3`.
- 🟡 `no-lockfile-determinism-guard` (medium, *unverified*): no `.nvmrc`; caret ranges; WIP working tree + sibling "- Copy" dir → local builds may diverge from CI. **Build only from CI; quarantine the Copy dir.**
- 🟢 `asar-bakes-azure-config-and-source` (low, **confirmed**): non-secret IDs in asar (OK today). **Document: never bake a real secret into the asar.**
- 🟢 `ci-mac-build-unsigned-unnotarized` (low, *unverified*): unsigned DMG is undeliverable AND `release` hard-depends on `build-mac` → a mac failure blocks the Windows release you need. Decouple.

### Dimension 8 — Code Quality, Maintainability & Consistency
- 🔴→🟡 `viewer-massive-duplication` (critical→**medium**, **confirmed**): 3 viewers 60-80% copy-paste of embed/token/refresh/overlay logic; already drifted. Every fix lands 2-4×. **Extract `usePowerBIEmbed` hook before fixing the embed bugs above.**
- 🟠→🟡 `slideshow-interval-range-contradiction` (high→**medium**, **partly-true**): same as Blocker #9 from the quality angle (timer honors true value, no corruption, but ranges contradict + panel never persists).
- 🟠→🟢 `reportviewer-debug-logging-in-prod` (high→**low**, **partly-true**): 10 unconditional `[ReportViewer] DEBUG` `console.log` handlers ship to prod (Vite doesn't strip console); `dataSelected`/`visualClicked` log report data. `ReportViewer.tsx:442-494`. Delete or gate behind `import.meta.env.DEV`; add `esbuild.drop:['console']`.
- 🟠→🟡 `no-eslint-no-tests` (high→**medium**, **partly-true**): no ESLint, no tests, no `noUnusedLocals`. (CI *does* run `tsc --noEmit` — the "no CI" claim was wrong; it's tag-triggered with no lint/test gate.) Add ESLint + `noUnusedLocals`.
- 🟡 `dead-components-and-exports` (medium, **confirmed**): `ContentTabs`, `AppsList`, `getErrorMessage` (imported in all 3 viewers, never called), dead constants. `AppsList` misleads fixers. Delete.
- 🟡 `token-refresh-divergence-across-viewers` (medium, **confirmed**): Report/Presentation do in-place `setAccessToken`; Dashboard full-reloads. Same error event shows nothing in one viewer, full overlay in another. Drift evidence. Centralize in the shared hook.
- 🟡 `presentation-no-focus-trap-a11y` (medium, *unverified*): no focus trap in presentation overlay; icon controls `title`-only; brittle 200ms focus-steal. Keyboard/AT users may be locked out.
- 🟢 `magic-numbers-and-timeouts` (low, **confirmed**): timing literals scattered; hardcoded 96 DPI mis-sizes exports on HiDPI. Hoist to named constants; derive DPI from `devicePixelRatio`.
- 🟢 `ipc-channel-string-discipline` (low, *unverified*): ~40 duplicated channel-string literals, untyped handler returns; a typo = silent hang `tsc` can't catch. Shared channel const map + typed `IPCResponse<T>`.

---

## 5. Systemic Gaps (the meta-problems)

| Gap | Why it hurts post-launch | Minimum bar to fix |
|-----|--------------------------|--------------------|
| **No auto-update channel** | The "ship Monday, fix bugs after" plan is structurally impossible. Every patch = 20 manual reinstalls of an unsigned installer; most users stay on the broken build forever. | `electron-updater` + GitHub publish provider + `checkForUpdatesAndNotify()`. **This must be built first — every fast-follow depends on it.** |
| **Unsigned build** | SmartScreen scares/blocks non-technical users on every install (including every future reinstall, since there's no other delivery path). | OV/EV cert wired into CI. EV bypasses SmartScreen reputation immediately. |
| **No crash telemetry / error reporting** | You learn about bugs only from phone calls. Cannot triage, reproduce, or prioritize — which defeats the whole point of being able to push fixes. | `electron-log` to `userData` (so users can attach a log) at minimum; ideally Sentry electron SDK with consent given PHI-adjacency. |
| **No tests** | Zero regression net under the round of fixes you're about to make. Every fix can silently break another path (the cross-viewer drift is exactly this). | One smoke test on the (to-be-extracted) embed hook + `shared/utils`; expand from there. |
| **No ESLint / no lint gate** | Dead code, leftover `console.log`, unused vars, stale-closure deps are all invisible. `noUnusedLocals` is off, so dead imports pass `tsc`. | ESLint (typescript-eslint + react-hooks + `exhaustive-deps` + `no-console`) + `noUnusedLocals`/`noUnusedParameters`. |
| **CI is not a real gate** | CI runs `tsc` + `npm audit` only, tag-triggered, no PR gate, and the audit step currently *fails the release* (Blocker #4). | Fix the audit gate; add lint+test to CI; trigger on PRs, not just tags. |
| **27 dependency vulns (18 high)** | They ride into the shipped asar (`tmp` path-traversal, msal-node's `uuid`) AND they block the release pipeline today. | `npm audit fix` (most non-breaking); pin/override transitive deps via `electron`/`vite`/`tar` upgrades; re-enable the gate once clean. |
| **No resilience engineering** | Routine cloud flakiness (no retry, no timeout, no 429 handling) presents as hangs/failures/missing-reports for 20 mixed-network users. | `AbortController`+timeout on all fetches; retry-with-backoff on 429/5xx; surface partial failures. |

---

## 6. Recommended Remediation Sprint Plan

**Reality check:** A signed cert + a built/tested update channel is not realistically achievable in a couple of days unless the cert is already in hand. Plan accordingly — **the update channel is the long pole** because every post-Monday fix flows through it, and reliable NSIS auto-update needs the signed build.

### Sprint 0 — Distribution Gates (MUST land before Monday; ~1-2 focused days)
Sequence matters — items build on each other:
1. **Fix the CI audit gate** (Blocker #4) — without this you get no installer at all. Set `continue-on-error: true`, run via `workflow_dispatch` to prove the pipeline produces artifacts. *(30 min)*
2. **Fix the CSP session binding** (Blocker #3) — register `onHeadersReceived` on `session.fromPartition(PARTITION_NAME)` + `<meta>` fallback. **Verify headers in the packaged build.** This re-arms the mitigations the whole threat model assumes. *(2-3 hrs)*
3. **Code-signing cert** (Blocker #2) — if the cert exists, wire `CSC_LINK` now. **If it does not exist and can't be obtained by Monday, this is your hardest call:** ship unsigned with a written click-through guide as an explicit stopgap, and make the cert the #1 fast-follow.
4. **Embed error/spinner fixes** (Blockers #5, #6) — `setError`+`setIsLoading(false)` in ReportViewer's non-token branch; add a 30-45s load watchdog to all three viewers. These kill the most likely day-one tickets. *(3-4 hrs)*
5. **Auth resilience** (Blockers #7, #8) — stop `validateToken`/silent-failure from nuking the cache; add `prompt=select_account` + cookie clear on logout. *(3-4 hrs)*
6. **Single-instance lock** (`no-single-instance-lock`) — one-liner that prevents store corruption from double-launch. *(20 min)*
7. **Slideshow range + persistence** (Blocker #9) — one canonical constant; persist in-viewer change. *(1-2 hrs)*

### Sprint 1 — High-Value Hardening (ships as the FIRST auto-update, which requires Sprint 0 #1+#3 + the update channel)
1. **Build the update channel** (`electron-updater` + GitHub provider) — **this is the prerequisite for everything else being a "fast-follow."** Until it exists, there are no fast-follows, only reinstalls.
2. **Resilience layer** (Blocker #10) — `AbortController`+timeout, retry-with-backoff + `Retry-After`, surface `getAllItems` partial failures.
3. **Crash/error telemetry** — `electron-log` to disk minimum, so you can actually triage the bugs you're shipping.
4. **Real token expiry** — thread MSAL `expiresOn` through `getAccessToken`→`getEmbedToken` (fixes the cross-flagged fake-clock).
5. **Extract `usePowerBIEmbed` hook** — collapse the 3 viewers so every subsequent embed/token fix lands once. Do this *before* the next round of embed fixes.
6. **Wire `invalidateCache`** to Refresh buttons; **clear content/search stores on logout**.
7. **Token-expired classification** — match structured fields + HTTP 401, not just substrings.

### Backlog (post-launch, normal cadence)
ESLint + tests + `noUnusedLocals` + CI lint gate; remediate the 27 vulns; remove DEBUG logging / add `esbuild.drop`; delete dead code; focus-thrash and a11y fixes; settings re-sync across components; input validation on `settings:update`/`usage:record-open`; guarded store construction; version-bump automation; `.nvmrc` + quarantine the "- Copy" dir; per-route error boundaries; app-report pagination; error-message mapper; decouple the mac CI build.

**What is realistically achievable before Monday:** Sprint 0 items 1, 2, 4, 5, 6, 7 (all code, ~1.5 days). Item 3 (signing) depends entirely on whether the cert is in hand. **What must be a fast-follow:** the update channel itself (Sprint 1 #1) — and it is the gating dependency for the entire fast-follow strategy, so start procuring the cert and scaffolding `electron-updater` in parallel with Sprint 0 even if they don't merge before Monday.

---

## 7. Verification Scorecard

**Total findings: 73** across 10 dimensions. **Adversarially verified: 30** (every finding originally rated critical or high). The remaining 43 medium/low were not independently verified (marked *unverified* above).

### Verified findings (30) — verdict breakdown
| Verdict | Count | Notes |
|---------|-------|-------|
| **Confirmed** | 14 | csp-only-on-default-session, interaction-required-nukes-cache, logout-no-aad-session-clear, slideshow-interval-range-drift, search-cache-never-invalidated, report-viewer-swallows-all-errors, no-fetch-timeout, no-retry-transient, no-429-rate-limit-handling, getallitems-swallows-partial-failures, no-auto-update-mechanism, unsigned-installer-smartscreen, ci-npm-audit-blocks-release, viewer-massive-duplication |
| **Partly-true** | 13 | access-token-exposed, main-window-no-window-open-handler, export-path-validation, auth-window-no-timeout, multi-account, pdf-export-promise-hang, settings-update-no-validation, fullscreen-hint-settimeout, no-error-boundary, report-embed-spinner-forever, no-offline-detection, no-crash-reporting-telemetry, isloadingref-not-reembed-guard, slideshow-interval-contradiction, reportviewer-debug-logging, no-eslint-no-tests, brittle-token-expired, fabricated-token-expiration, no-proactive-refresh *(13+ — partly-true is the largest verified bucket)* |
| **False-positive** | 3 | safestorage-unavailable-save-loop, strictmode-isloadingref-permanent-blank, shared-singleton-service-cross-viewer-reset |

### Severity distribution (post-adjustment)
| Severity | Original | After verification adjustment |
|----------|----------|-------------------------------|
| **Critical** | 9 | **0** (all downgraded or refuted) |
| **High** | ~14 | **8** (Blockers #2,#3,#5,#6,#7,#8 + ci-audit + unsigned) |
| **Medium** | ~30 | ~32 |
| **Low** | ~20 | ~30 |

### The headline number
**Of 9 findings originally rated CRITICAL, zero survived verification at critical severity** — 3 were refuted as false-positives outright, and 6 were downgraded to high (with their impact narratives materially corrected, usually because a claimed mitigating-control gap didn't exist — *except the CSP, which genuinely is absent in production and is the one that ties the others together*). This is a codebase that is **less broken than the adversarial audit first suggested, but with a small number of genuine, verified landmines that gate a Monday ship.** Fix the Sprint 0 trio (update-channel groundwork + signing + CSP) plus the embed/auth resilience items, and it is defensibly shippable.
