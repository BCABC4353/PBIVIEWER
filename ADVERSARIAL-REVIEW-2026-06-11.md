# Adversarial Multi-Dimensional Review — PBIVIEWER

Date: 2026-06-11 · Baseline: `ee1bca0` (v2.2.14) · Branch: `claude/gracious-pasteur-cc3v5i`

Seven independent adversarial review passes: desktop main process, desktop renderer,
mobile app, security, build/CI/release, maintainability/editing-ergonomics, UX/UI.
Every Critical/High claim below was verified against actual code by the reviewing
pass (several were proven by executing code or diffing binaries).

**Verified-green baseline** (run on a clean clone during this review):
- Desktop: `tsc -p tsconfig.main.json` ✅, `tsc -p tsconfig.renderer.json` ✅, ESLint ✅, 520/520 tests ✅
- Mobile: `tsc --noEmit` ✅, 221/221 tests ✅
- Caveat: `scripts/generate-config.js` hard-fails on a clean clone without `.env`
  (exit 1, no `*.generated.ts` emitted) → `npm run build`/`dev` is broken out of the
  box; tests only pass because `vitest.config.ts` stubs the generated imports.

---

## 0. Why automated editors were struggling (ranked, evidence-backed)

1. **God-files with massive internal repetition — the #1 exact-match edit killer.**
   - `src/main/services/powerbi-api.ts`: 2,073 lines / 80.5 KB, **~40% of lines are
     duplicates of other lines in the same file** (823 duplicate-line instances,
     14 byte-identical `} catch (error) { return { success: false,` openings,
     repeated `// ---…---` divider lines).
   - `src/renderer/components/insights/InsightsPage.tsx`: 1,977 lines / 84.5 KB,
     **16 components in one file**, 676 duplicate-line instances, 112 near-identical
     inline `style={{` blocks.
   - Short edit anchors match multiple locations ("string not unique"); long anchors
     get retyped imperfectly because the file can't be held in context ("string not
     found"). Both failure modes compound when an earlier edit in the same session
     shifts text.
2. **Invisible Unicode in source.** Comment dividers built from 27–60 consecutive
   U+2500 `─` box-drawing chars (`mobile/src/auth/msal-auth.ts:13`,
   `mobile/src/ui/SettingsScreen.tsx` ×5, `mobile/src/visuals/palette.ts:35`) plus
   pervasive em-dashes/`→`/`∈` in comments. Visually identical to ASCII `-`/`->`;
   any retyped anchor mismatches at the byte level and fails with no visible reason.
3. **Twin files: same name, different contents.** `blast-radius.ts` exists in both
   trees with **93% different content** (desktop: cascade/suspect computation;
   mobile: tile severity/grouping). `types.ts` ×2. `relativeAge`/`triggerLabel`
   defined twice with different signatures. Grep-driven edits land in the wrong tree.
4. **Broken verification loop on fresh clones.** No root README or CLAUDE.md;
   `tsc -p tsconfig.main.json` fails until `npm run generate-config` runs (and that
   needs Azure GUIDs in `.env`); root `npm test` covers desktop only; `mobile/` is a
   separate package needing its own install. An agent whose verification step errors
   will keep mutating edits that were actually correct.
5. **Context exhaustion on the hot files** (the two files most likely to need edits
   are the two 80 KB+ ones).

Ruled out: line endings. No CRLF, BOM, tabs, or trailing whitespace anywhere today —
but there is no `.gitattributes`/`.editorconfig` enforcing it, with a Windows dev
machine in the loop.

**Fixes (highest leverage first):**
- Split `InsightsPage.tsx` (clean seams: every component is a top-level const) and
  `powerbi-api.ts` (request-core / catalog / insights / admin / export / freshness).
- Root `CLAUDE.md` + `README.md`: generate-config prerequisite, never touch
  `*.generated.ts`, two-tsconfig typecheck commands, mobile = separate package
  (React 19 vs 18!), `RELEASE_REQUEST` is a release trigger — don't "clean it up",
  copy edit anchors exactly (Unicode warning).
- Replace U+2500 divider runs with ASCII (7 sites, mechanical).
- Add `.gitattributes` (`* text=auto eol=lf`) + `.editorconfig`.
- Rename one of the two `blast-radius.ts`; add reciprocal MIRRORED-IN comments on
  ported logic (or extract a shared pure-TS package — both copies already advertise
  "no Electron / no RN imports").
- `wrapIPC(code, fn)` helper to collapse the 14 identical catch blocks.

---

## 1. Critical

| # | Finding | Where | Found by |
|---|---------|-------|----------|
| C1 | **Fleet force-update has no canary, no health gate, no rollback.** Every release unconditionally force-restarts all Windows machines within ~15 min (30s grace even on wall displays). A build that passes tests but crashes at launch bricks the fleet *unrecoverably*: a crashed app never runs the updater, `allowDowngrade=false`, and the documented rollback is roll-forward-only. Gate = a 27%-statement test suite. | `build.yml:217-254`, `updater.ts:14-16,105-135` | Build/CI + Security |
| C2 | **Mobile `invalid_grant` detection never fires in production.** Code tests `e.message` for the string, but expo-auth-session puts the code in `e.code` — the message carries human prose (verified against installed package source). Revoked refresh tokens are retried forever; user is never returned to signed-out state. Unit tests pass only because fakes throw the string in the message. | `mobile/src/auth/token-manager.ts:172` | Mobile |
| C3 | **Production Azure client/tenant GUIDs hardcoded in a script distributed via `irm <raw main> \| iex`** (and echoed in the runbook). Client IDs aren't OAuth secrets, but a public-client registration + fetch-and-execute-from-`main` distribution = phishing primitive + arbitrary-code-execution for anyone controlling `main`. | `diagnose-pbi.ps1:5,23-24`, `run-phone.ps1` (also `git reset --hard` on user machines) | Security |

## 2. High

### Security / supply chain
- **H-S1. Unsigned auto-update + single-account kill-switch.** `verifyUpdateCodeSignature:false`; policy pulled from raw GitHub; anyone with repo write (incl. via `RELEASE_REQUEST` push → `release-bridge.yml`) ships silent code-exec to the whole fleet in minutes. Highest-leverage fix: code signing + `verifyUpdateCodeSignature:true` + branch protection. (`electron-builder.yml:49`, `updater.ts:9`)
- **H-S2. Token cache "encryption" = hardcoded key in source.** `token-cache.ts:36` `ENCRYPTION_KEY = 'pbiv-auth-cache-v2-2026-at-rest-obfuscation'`. Refresh token decryptable offline by anyone with file read + the public binary. **Docs still claim DPAPI/safeStorage** (`docs/GO-LIVE-RUNBOOK.md:72`) — false. Deliberate trade-off (VDI/roaming), but undocumented downgrade. Re-layer safeStorage where `isEncryptionAvailable()` round-trips; fix the runbook.
- **H-S3. Beacon GitHub token ships in the binary**, trivially extractable from app.asar; "obfuscated at rest" is false comfort. Scope discipline at PAT-mint time is the only control. Default `includeNames=true` sends report/dataset names to GitHub.

### Desktop main process
- **H-M1. Issue Beacon opens a NEW GitHub issue on every flush.** `issueNumber` is never assigned (the injected `postJson` returns only HTTP status, discarding the body carrying the number) — the "one issue per install, comments thereafter" design is structurally dead code; a struggling fleet = issue storm. The test titled "…then appends comments on later flushes" never performs a second flush. (`issue-beacon-service.ts:82,138-156`)
- **H-M2. Account-switch cache leak race.** Long-running Insights snapshot started under account A completes after `clearCaches()` and repopulates the cache; account B is served A's workspace access lists/names for the 5-min TTL. Fix: generation stamp on builds. (`powerbi-api.ts:1079-1082,1600-1603,1841-1843`)
- **H-M3. PDF export handler throws instead of returning IPCResponse** — contract drift on the most failure-prone path (file locked/disk full). (`ipc/content.ts:107-115`)
- **H-M4. `getAdminAccessToken()` bypasses the single-flight token lock** — races acquireTokenSilent+persistCache against itself (invoked under concurrency 2) and against renderer token calls; the exact MSAL-cache-corruption hazard the lock documents. (`auth-service.ts:117-120` vs `:717-722`)
- **H-M5. Usage records match by item id only, ignoring accountId** — account B opening a shared item steals A's record + open count; per-account scoping silently defeated on shared machines. (`usage-tracking-service.ts:146,158`)

### Desktop renderer
- **H-R1. Settings optimistic rollback clobbers concurrent updates.** SettingsPage fires un-debounced IPC per slider drag step; one mid-burst failure restores a whole-object snapshot, reverting unrelated in-flight settings; store/disk diverge until restart. Roll back per-key + debounce (the codebase already has `useDebouncedSettings`). (`settings-store.ts:42-68`, `SettingsPage.tsx:282,463`)
- **H-R2. Report→report navigation keeps stale `datasetIdRef`** — freshness toolbar can show the previous report's stamp for up to 5 min and mis-baseline `newDataAvailable` (the feature the last two releases targeted). Clear the ref on `reportId` change or key the viewer. (`ReportViewer.tsx:37,62-100`)

### Mobile
- **H-Mo1. Sign-out race resurrects credentials** (proven with a written test against the real `TokenManager`): `clear()` resets flags before `storage.remove()` resolves; concurrent `load()` re-hydrates the zombie refresh token → sign-out bypass on shared devices. (`token-manager.ts:129-135`)
- **H-Mo2. "Sample data" mode is unreachable.** Settings offers it; every tab gates on `reports === null` and shows "Connect to Power BI" in mock mode. ~200 lines of dead-but-tested mock pipeline; user-visible promise broken. (`Root.tsx:50-64`, `data-source-factory.ts:58-63`, `SettingsScreen.tsx:335-339`)

### Build / CI — time-sensitive
- **H-B1. ⏰ Node-20 actions deadline: June 16, 2026 (5 days).** All workflows pin `checkout@v4`/`setup-node@v4`/`*-artifact@v4` (Node 20 runtime); runners default these onto Node 24 on June 16. `.nvmrc`=20 and three hardcoded `'20'`s; Node 20 itself went EOL April 2026. Your own runbook (`GO-LIVE-RUNBOOK.md:98`) called this out. Bump actions majors + move to Node 22/24 + use `node-version-file` everywhere.
- **H-B2. Mobile tests/typecheck run in NO workflow.** 10 test files + `tsc` exist and pass (verified manually) but CI never executes them; auth-token logic regresses silently. Add a path-filtered mobile job.
- **H-B3. Draft-opened PRs can merge with zero CI.** `ready_for_review` missing from trigger types; skipped required job counts as passing. (`ci.yml:4,19`)

### Maintainability / UX (High tier)
- **H-X1. Accent doctrine inverted on desktop:** 10+ orange elements on one screen, orange button fills (`brandRamp.ts` anchored on `#FF5F15`), white-on-orange ≈3.0:1 (fails AA). Insights/Luce follows the doctrine; the rest never got the pass. Status colors spent on *content types* (dashboard=green, app=purple — three different codings across Search/Workspaces/Home).
- **H-X2. Tenant badge hash can land on RED** — a permanent fake alarm in the titlebar of a monitoring app (`TitleBar.tsx:33-50`; visible in every authenticated screenshot).
- **H-X3. Fresh-vs-stale screenshots are byte-identical** (`11-…fresh.png` ≡ `12-…stale.png`, same md5) — the screenshot pipeline silently failed AND the stale treatment (12px amber + "⚠", 24h hardcoded) is invisible at distance. The product's core promise has no visual proof.
- **H-X4. Home empty state renders as concatenated text soup** ("…ViewerBrowse your workspaces…access.Signed in as") — Tailwind `block` loses to Fluent inline display; first post-login screen visibly broken. (`HomePage.tsx:196-207`, `04-home-empty.png`)
- **H-X5. Sign-out: three flows, two skip confirmation** (Home empty state, Settings) and Switch account never confirms. (`HomePage.tsx:212`, `SettingsPage.tsx:199`, `TitleBar.tsx:206-213`)
- **H-X6. Kiosk exit UX contradicts itself:** kiosk shows both "Hold Esc 3s" and an inert "Esc: Exit"; 11px 40%-white hint over arbitrary report content; zero in-progress feedback during the 3s hold; Settings never mentions the gesture.
- **H-X7. Mobile charter violations:** rows < 44pt (`AlertsScreen.tsx:185-193`, `components.tsx:162-166`), "Sample data" wordmark missing from figure screens, timestamps not absolute-on-press, static pressed states (while `PressableScale` exists unused).
- **H-X8. Test coverage thin where load-bearing:** zero tests for `updater.ts` (fleet-wide blast radius), `settings-service`, `usage-tracking-service`, `window.ts`, 9/11 IPC modules, auth/settings stores, `validation.ts`; 19 renderer component files → 5 test files; thresholds pinned at 27% statements.

## 3. Selected Medium (full lists in per-pass sections below)

**Main process:** `login()` double-click TOCTOU (pendingAuthState set after awaits); settings store never back-fills defaults for fields added post-install (`usageClearOnLogout` → undefined ≈ 'never'); kiosk crash recovery gives up FOREVER after 3 fast crashes (blank wall display); HTTP 502 not retriable (500/503/504 are); save-dialog allows folders the export validator then rejects; webview misses `will-redirect` guard (auth window has it); federated tenants (ADFS/Okta) silently stall the auth window.

**Renderer:** pre-load TokenExpired dead-ends until the 45s watchdog; stale-generation `finally` stomps a newer refresh's in-flight flag; debounced settings dropped (not flushed) on unmount despite its own doc; search failures render as "No results found" (store `error` field is dead — and its test asserts a state production can't produce); Ctrl+K works during presentations and Escape-to-close-search also exits the slideshow; Insights mid-morph press router + CSS make mutually contradictory Chromium hit-testing claims (double-activation risk on Electron bump); slide index unclamped when deck shrinks ("Slide 26 / 5"); hue-only status on tile edges and red/green lineage strokes (violates own doctrine); `brendan@bc-abc.com` hardcoded as feature gate ×2 (`AppViewer.tsx:184-188`, `InsightsPage.tsx:1179`); `switchAccount` lacks login's 130s timeout race (hang = stuck LoadingScreen); `useSignOutConfirm` recreates the Dialog component type per render (remount churn).

**Mobile:** device-code cancel→reconnect revives the old poll loop (shared boolean → two concurrent loops); AAD's actual `authorization_declined` not mapped; tab-switch silently kills in-flight device-code sign-in; worst-first ordering contradicts desktop's "Matt #4" ranking (amber overdue tile can rank below grey); `pbi.error` payload error codes dropped (desktop parses them); no generation guard on Fleet/Alerts loads (stale snapshot overwrite + double source rebuild); `$top=5` vs desktop's 12 (5 straight failures lose `lastSuccessTime`).

**Security:** redaction misses URL-query secrets (`?code=`, `?sig=`, opaque tokens) and TLD-less UPNs; `shell.openExternal` forwards `http:` from webview popups (other sites are https-only); `@odata.nextLink` followed without host assertion (Bearer attached to whatever URL the API returns); msal-node 2.x and electron-store 8 a major behind (the electron-store-8 pin is *correct* for CJS but undocumented — will get "helpfully" upgraded); actions pinned by tag not SHA; npm audit double-suppressed (`|| true` + `continue-on-error`).

**Build/CI:** mac-failure tolerance publishes `latest` releases that prompt Mac users toward a download that doesn't exist (and `latest-mac.yml` is never uploaded at all); version bump + tag pushed to main BEFORE tests run (red run = orphan tag + bumped main); `version` job push lacks the rebase-retry that force-policy has; concurrency queue silently cancels intermediate release requests; force-policy clobbers a manually-set `0.0.0` pause (no hold input); packaged app ships 12 compiled `*.test.js` + all `.d.ts` in the asar; `vite/vitest.config.ts` type-checked and linted by nothing; all test files excluded from ESLint; `.mjs` scripts linted by nothing; pipeline + updater silently depend on repo being public (policy fetch fail = "no force, ever," silently); `create-icons`/`take-screenshots` import deps not in package.json; `take-screenshots` exits 0 when every screenshot failed (cause of H-X3).

**Maintainability:** `src/shared/blast-radius.ts` header comment still documents the v1 cascade rule its own function (v6, "GREEN FEEDS GREEN") contradicts; `docs/design/BLAST-RADIUS.md` stale (v1); refresh-health port already drifting (errorCode parsing, recentRuns vs recentDurationsMin) with a one-way pointer; four styling systems (Tailwind + Fluent + globals.css + 867-line insights-luce.css + 112 inline styles); `.claude/settings.local.json` committed with machine-specific paths; `constants.ts` declares "single source of truth" that nothing imports; `dotenv` dependency unused; shallow clone (50 commits) breaks blame/archaeology; mixed naming conventions (kebab/camel/Pascal in same dirs); 6 exports in insights-luce.ts kept alive only by tests.

**UX:** spinner soup on desktop (8 sites) vs doctrine + mobile's own skeletons; raw `String(error)` surfaces on the home path (content-store) while other consumers use `userMessage`; login failure copy is a dead end (and can carry raw exception text); featured workspace tiles all navigate to generic /workspaces despite per-workspace labels; two search placeholders disagree on scope; 5 names for slideshow/startup concepts; US-only date format hardcoded; user guide documents an app one feature behind (no Insights entry in captured sidebar; 3 more duplicate/wrong screenshots); workspace accordions lack aria-expanded; mobile scrub gesture has zero affordance; device-code screen lacks expiry countdown.

## 4. Low / Nit (compressed)

Beacon buffer lost at quit (no flush on will-quit); `exportCurrentViewPdf` non-atomic write (sibling does tmp+rename); data-URL capture can exceed Chromium URL cap on 4K displays; `setTitleBarOverlay` payload unvalidated (renderer-triggerable throw); blast-radius report join case-sensitive while dataflow join is deliberately case-insensitive; usage eviction cap global not per-account; forced-update download failure retries only on the 2h timer; token-cache corruption listeners registered but never fired (dead recovery path, tests validate it); kiosk recovery timer restarts on error-message change; focusReclaimTimers leak in long sessions; dead `.title-bar-drag` CSS; nested `<nav>` landmarks; GUID regex accepts non-GUID 36-char runs (`app-report-freshness.ts:44-48`); `999.95` → "1000" in mobile compact(); negative bars indistinguishable from zero; `APP_VERSION` hardcoded in SettingsScreen; deprecated top-level `splash` in app.json; `package.json` missing `"type"` (lint warning noise) and `engines`; ci.yml still lists `master`; mac artifact names contain spaces; LOGO.png at root referenced by nothing; ~2.5MB binaries in git; RELEASE_REQUEST undocumented at root.

## 5. Cross-pass convergence (independent confirmations)

- **DPAPI/safeStorage doc claim is false** — found independently by Security and Maintainability.
- **`updater.ts` untested + fleet force-update fragility** — Main-process, Build/CI, and Security all converged.
- **Desktop/mobile port drift** (refresh-health, severity ordering, blast-radius split-brain) — Mobile and Maintainability.
- **Screenshot pipeline rot** — UX (byte-identical fresh/stale) and Build/CI (script exits 0 on total failure) found cause+symptom independently.
- **Hue-only / red-discipline violations** — Renderer and UX.

## 6. Recommended priority order

1. **This week (deadline-driven):** bump GitHub Actions majors + Node version (June 16); add a health gate or soak delay between `release` and `force-policy` (C1).
2. **Auth correctness:** mobile `invalid_grant` by code + atomic `clear()` (C2, H-Mo1); main-process admin-token single-flight (H-M4); Insights cache generation stamp (H-M2).
3. **Editing ergonomics (unblocks all future agent work):** root CLAUDE.md/README, split the two god-files, ASCII dividers, `.gitattributes`/`.editorconfig`, rename one `blast-radius.ts`.
4. **Quick correctness wins:** beacon issueNumber (H-M1), PDF export envelope (H-M3), usage accountId matching (H-M5), settings per-key rollback + debounce (H-R1), datasetIdRef clear (H-R2), kiosk recovery never-give-up (M), mobile CI job (H-B2), draft-PR trigger (H-B3).
5. **Security posture:** code signing + `verifyUpdateCodeSignature:true`; fix the runbook's DPAPI claim; stop `irm | iex` distribution; redaction gaps.
6. **UX pass:** color subtraction pass (chips/tenant badge/red discipline), home empty-state layout bug, unify sign-out confirmation, kiosk Esc-hold progress feedback, freshness as a first-class chip, mobile charter fixes (44pt, sample-data wordmark, absolute timestamps).
