# Phase 1 Findings — Desktop Power BI Viewer go-live review

Base: `main` @ v2.2.16. Six antagonist agents (auth/updater, REST/freshness, IPC/security,
viewer/kiosk, insights/ErrorBoundary, settings/build). Items I personally re-verified against
source are marked **[verified]**.

Legend: ✅ = clear code fix, low regression risk · ⚖️ = owner decision / risk-acceptance · 🔬 = needs runtime/hardware confirmation

---

## CRITICAL

| ID | Finding | Disposition |
|----|---------|-------------|
| **B-C1** **[verified]** | `freshness.ts:192-193` treats an **in-flight** refresh (`status:'Unknown'`, no `endTime`) as success-like and returns its `startTime` as "last refreshed" — presenting data that hasn't landed (or may fail) as current. `refresh-health-core.ts:67,70` classifies the same case correctly as `InProgress`; the two paths disagree. Feeds the per-report freshness stamp. No test covers Unknown-without-endTime. | ✅ Fix: only success-like if `Completed` or (`Unknown && endTime`); + regression test. |
| **F-C1** | Issue-beacon sends Power BI **report/dashboard names** (`includeNames` defaults true) to an external GitHub repo on embed errors. Redaction strips emails/JWTs/GUIDs but **not free-text names** — `"ICU Census Ward 4B"` ships verbatim. Potential HIPAA disclosure outside the BAA boundary. | ⚖️ Unverifiable from checkout (`beacon-config.generated.ts` is a CI secret). **Owner must confirm prod env.** |
| **F-C2** | If the beacon ships, a GitHub PAT is baked into `beacon-config.generated.ts` → compiled into every client binary and sent as `Bearer`. Extractable from the asar fleet-wide. | ⚖️ Owner confirm (tied to F-C1). |
| **A-C1** **[verified]** | Windows auto-update has **no code-signature verification** (`verifyUpdateCodeSignature:false`, unsigned build); only trust anchor is "latest GitHub release." Combined with the `forceMinVersion` lever, anyone who can publish a release / edit `update-policy.json` owns the fleet within ~15 min. | ⚖️ Code-signing can't land tonight; conscious risk-acceptance. |
| **C-C1** **[verified-ish]** | `content:export-report-pdf` does `fs.rm(filePath,{force:true})`+rename on any renderer-supplied `.pdf` under Downloads/Desktop/Documents — can silently clobber a user's existing PDF; not nonce-bound to the save dialog. | ✅ Fix: bind to the dialog-returned path / refuse to overwrite files the app didn't create this session. |
| **E-C1** **[verified]** | Single ErrorBoundary at app root (outside router), no auto-recovery → an unattended render crash white-screens the kiosk until a human clicks. Also renders raw `error.message` in **production** (line 81-83) — PHI/internal leak on a public wall display. | ✅ Fix (low-risk): gate raw message behind dev; ⚖️/moderate: per-surface boundaries + kiosk auto-retry. |
| **D-C1** **[verified]** | `autoStartSlideshow` is a real settings toggle, but `AutoStartRouter` (App.tsx:119-138) only handles `report`/`app` — **nothing honors it at boot**. After any reboot/forced-update restart a kiosk lands on a static report, never the slideshow; all v2.2.16 kiosk hardening (Esc-hold, recovery, sleep-block) is PresentationMode-scoped and never engages unattended. | ✅ Fix: in the `report` branch, if `autoStartSlideshow` navigate to `/presentation/...`. Top product priority. |

## HIGH

| ID | Finding | Disposition |
|----|---------|-------------|
| **A-C2** **[verified]** | `forceInstallNow` (updater.ts:76-102) has no attempt ceiling → a repeatedly-failing `quitAndInstall` re-pops the "Restart now" dialog every 10 min (forceCheck:141). Restart-nag loop on a bad/locked/AV-quarantined unsigned artifact. | ✅ but ⚠️ safety-critical file. Fix: add attempt ceiling/backoff; minimal & well-tested only. |
| **B-H2** | A server-side 401 (token revoked/CA change mid-session) never triggers a forced silent re-acquire; it dead-ends as "session expired, sign in again." Violates sign-in-once. | ✅ Fix: on 401, retry once with `forceRefresh:true` before surfacing. (renderer re-auth wiring unverified 🔬) |
| **D-H1** **[verified]** | `useKioskRecovery` resets `attemptRef=0` whenever `error` goes falsy; `reload()` clears error → backoff resets to 5s every retry, defeating 5→30→60s. Persistent outage = hammering AAD every ~5s for days. | ✅ Fix: reset attempts only on successful load, not transient error-clear. |
| **D-H2** | A deleted/unauthorized report mid-rotation → permanent full-screen error overlay; advance interval keeps firing under it. One bad report blanks the wall indefinitely. | ✅/moderate: after N failed recoveries keep retrying non-blocking; gate advance on `error`. |
| **E-H3** **[verified]** | A failed forced refresh keeps the stale `snapshot`, shows **no error** (banner only renders when `!snapshot`), and the "Checked Xm ago" stamp still shows old time → stale data looks fresh. | ✅ Fix: surface refresh errors inline when a snapshot already exists. |
| **A-H1** | `getAccessToken()` shares one in-flight promise; a concurrent caller during an account switch gets the **previous account's** token (HIPAA cross-account). | ✅/moderate: key in-flight dedup by account, or invalidate on active-account change. |
| **C-H1/H2** | CSP `frame-src` and `POWERBI_ALLOWED_HOSTS` are out of sync (B2C/login.live reachable but not in CSP); `will-attach-webview` doesn't force `sandbox:true`. | ✅/moderate: single shared host list; force sandbox on webview attach. |
| **H2-rel (F)** | Release pipeline tags+bumps `main` **before** build/test; a failed run leaves an orphan version+tag. Recovery: re-run, accept skipped version (safe per updater). | ⚖️ note only — do not edit workflow. |
| **F-H3** | `force-policy` auto-points `forceMinVersion` at tonight's release → entire live fleet force-restarts within ~15 min, mid-business-hours, no canary. | ⚖️ Owner: force at 0800 or pause lever for a soak. |

## MED / LOW (selected — full detail in agent reports)
- **A-H3 / C-M2 / E-M1:** raw `String(error)` surfaced to renderer/UI in several handlers — leak internals; map to generic `userMessage`, log detail in main only. ✅ cluster.
- **A-M1 ⚖️:** token cache "encryption" is a hardcoded constant key, not OS-bound (DPAPI/`safeStorage`) — HIPAA at-rest sign-off.
- **A-H2/M2 ⚖️:** `validateToken` 5-min short-circuit can report a revoked account valid; `getActiveAccount` auto-adopts `accounts[0]` on multi-account machines.
- **A-M4:** `switchAccount` may proceed on partially-failed logout (leftover cookies → silent re-auth of prior user).
- **B-M3:** schedule-overdue detection ignores actual schedule times/timezone (approx badge only; timestamp itself accurate).
- **B-M4:** dashboard-tile / upstream-dataflow lookups read only first page (silent truncation on large workspaces).
- **C-M1 [verified pattern]:** several IPC handlers rely on the callee not throwing rather than wrapping — add a `safeHandle()` wrapper (defense-in-depth; contract tests don't catch throws).
- **E-M2:** "% healthy" counts never-run/dormant datasets as healthy → board can read 100% when nothing has refreshed.
- **D-M3 🔬:** display-sleep/monitor-hotplug fullscreenchange can silently exit slideshow.
- **F-H1:** settings/usage writes non-atomic; mid-write forced-restart can reset kiosk config to defaults (`clearInvalidConfig` prevents crash but silently wipes config).
- **F-M1:** beacon drops + duplicates issues on an empty create response (telemetry only).

## Verified-clean (no action)
HTTP retry/backoff/429 + Retry-After handling; catalog pagination; per-report dataset resolution
logic itself (risk is B-C1 one layer down); four-way IPC channel sync (no orphans/dupes); Electron
baseline (contextIsolation/nodeIntegration/sandbox/webSecurity, certificate-error, window-open
handlers); reduced-motion fallbacks + RAF cleanup on insights; embed lifecycle teardown/no leak;
`clearInvalidConfig` = no startup crash on bad settings; `usageClearOnLogout` enforced.
