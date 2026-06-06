Confirmed against ground truth. Key facts verified:
- 44 uncommitted changes on `sprint0-hardening` (40 tracked modifications/deletions + untracked `src/renderer/hooks/`, `src/shared/utils.ts`, `src/shared/ipc-types.ts`, `docs/`).
- `src/renderer/hooks/` **already exists untracked** — the hook the plan says to "extract" may already be partially in progress.
- `src/shared/utils.ts` is **untracked** — yet QUAL-03/DX-02/TEST-02 reference it as existing with `getErrorMessage`.
- `electron-builder.yml:6 publish: null` confirmed.
- `build.yml:84 needs: [build-windows, build-mac]` confirmed — mac DOES block release.
- audit step at lines 29 and 64, no `continue-on-error` — confirmed.

I have everything needed. Here is the adversarial review.

---

# ADVERSARIAL REVIEW — Power BI Viewer Hardening Plan

Prioritized corrections the Scrum Master MUST apply before finalizing. Severity-ordered; P0 items block the Monday gate.

---

## P0-1 — UNCOMMITTED WIP ON `sprint0-hardening` INVALIDATES THE ENTIRE WORKTREE STRATEGY (showstopper, not in any risk register)

**Ground truth I verified on disk:** `sprint0-hardening` has **44 uncommitted changes** — `src/main/index.ts`, `auth-service.ts`, `powerbi-api.ts`, `token-cache.ts`, `settings-service.ts`, `usage-tracking-service.ts`, `preload/index.ts`, `ErrorBoundary.tsx`, `build.yml`, `electron-builder.yml`, `package.json` all modified, plus deleted files (`cache-service.ts`, `favorites-service.ts`, `AppContentPage.tsx`, etc.), plus **untracked `src/renderer/hooks/`, `src/shared/utils.ts`, `src/shared/ipc-types.ts`**.

TOOL-02 dispatches four worktrees "off branch `sprint0-hardening`" and TOOL-09 branches off it again. **`git worktree add` checks out the committed tip — it will NOT carry the 44 uncommitted files.** Every agent will build against a tree that is missing the in-progress work, produce phantom diffs, and collide catastrophically on merge. The tooling stream's own openRisk #4 worries about the "- Copy" dir but **completely misses that the canonical repo's own working tree is dirty.**

This contradicts findings the plan itself cites: `no-lockfile-determinism-guard` explicitly warns "WIP working tree ... → local builds may diverge from CI."

**Correction:** Before ANY worktree is spawned, the Scrum Master must commit or stash the 44-file WIP on `sprint0-hardening` (a `wip:` checkpoint commit), and the plan must add an explicit pre-flight gate: `git status --short` returns empty before `EnterWorktree`. This is the true Sprint 0 task #0.

## P0-2 — `src/shared/utils.ts` AND `src/renderer/hooks/` ARE UNTRACKED — TASKS ASSUME THEY EXIST AS BASELINE

QUAL-03, DX-02, TEST-02, and VIEW-01 all reference `getErrorMessage`/`isTokenExpiredError` in `shared/utils.ts` as established code (DX-02 even quibbles over the audit's precision about it). But `utils.ts` is **untracked WIP** — it is not on the committed branch tip. Worse, **`src/renderer/hooks/` already exists untracked**, meaning the `usePowerBIEmbed` extraction (VIEW-HOOK / QUAL-02) the plan treats as greenfield **may already be half-built**, and nobody on the team knows its current state.

**Correction:** Add a reconnaissance task (Explore, read-only) to inventory the untracked `hooks/` and `shared/` contents and reconcile them against VIEW-HOOK/QUAL-02 scope BEFORE planning the refactor. The "Plan/Explore confirm file:line evidence on disk" ceremony must run against the actual dirty tree, not assumptions.

---

## 1. COVERAGE GAPS (orphaned confirmed/partly-true findings — no task addresses them)

I did a full traceability sweep of all 96 finding IDs in `findings-raw.json` against every `findingsAddressed` array. The plan's `notes` claims *"every audit finding ID from all three docs is mapped to exactly one epic."* **That claim is false at the task level** — epics list findings in `findingsCovered` that no concrete task implements. Orphans:

**ENTIRE "Embed lifecycle" DIMENSION IS UNMAPPED (8 findings, lines 741-901 of findings-raw.json).** This dimension exists only in `findings-raw.json` — it is not summarized in the teardown markdown, which is likely why it was missed. Orphans:

- **`no-proactive-refresh-while-visible`** (verified **partly-true, adjustedSeverity medium**). The kiosk/wall-display token never proactively refreshes because refresh is wired only to `visibilitychange`. This is the **headline use case** per the PO ("wall display"). AUTH-05 threads the *real* `expiresOn` but **no task adds the visibility-independent refresh timer** the finding requires. The accurate expiry is useless if nothing checks it on a foregrounded kiosk. **This is a day-one defect for the stated primary use case and is completely unaddressed.**
- **`auto-refresh-races-token-refresh`** (medium) — VIEW-06 changes the refresh *default* but explicitly scopes out the token/refresh serialization race. Orphan.
- **`dataset-refresh-info-success-on-failure`** (certain, medium) — `getDatasetRefreshInfo` returns `success:true` on every failure. Directly contradicts the PO's "no silent success on half-empty catalog" theme. No task. Orphan.
- **`zero-visible-pages-stuck`** (medium) — presentation enters fullscreen with zero slides = dead black screen, reads as frozen. Orphan.
- **`presentation-bookmark-apply-swallowed`** (medium) — counter desyncs from displayed slide on unattended display. Orphan.
- **`export-fallback-leaves-panes-hidden-on-throw`** (certain, medium) — failed export permanently strips filter/nav panes for the session. Orphan.
- **`export-feature-detection-string-match`** / **`single-page-fullscreen-no-hint`** / **`presentation-exit-double-navigate`** — low, orphan (acceptable to defer, but should be explicitly logged, not silently dropped).

**Other confirmed/verified orphans:**

- **`usage-store-read-throws-unhandled`** (likely, medium) — store constructed at module top with no try/catch; **a corrupted usage file crashes main-process startup with no recovery.** This is the single worst failure mode for a non-technical user (app won't boot). It is *adjacent to* but **not covered by** SEC-02 single-instance-lock — SEC-02 prevents the *cause* (dual writers) but not the *crash on already-corrupt file*. Listed in EPIC-QUALNET `findingsCovered` but **no QUALNET task implements the guarded construction.** Given SEC-02 ships Monday and admits corruption is already possible, this guard belongs in Sprint 0, not orphaned.
- **`export-writefile-no-dir-guard`** (confirmed, low) — orphan.
- **`presentation-mousemove-dual-listener-redundant-timer`** (confirmed, low) — listed in EPIC-A11Y-LONGTAIL `findingsCovered` but no task; PERF audit #13 + #8 (`inline-prop-literals-rerenders`) — **`inline-prop-literals-rerenders` (PERF #8, medium) has no task at all.**
- **`embedded-config-and-redirect-localhost`** — the CRLF `.env` parse sub-issue is flagged in BUILD stream openRisks ("generate-config.js .env naive parse — CRLF breaks AAD redirect") but **no task fixes it**; a broken redirect URI breaks auth for everyone. Either fix it or prove it's a non-issue — do not leave it as a dangling risk note.

**Action:** The PO's traceability claim must be corrected. Every orphan above needs either a task or an explicit, logged "won't-fix-for-now" disposition. `no-proactive-refresh-while-visible`, `usage-store-read-throws-unhandled`, and `dataset-refresh-info-success-on-failure` should be pulled forward given they hit the stated primary use case and the "no silent success" product theme.

---

## 2. SEQUENCING ERRORS

**SEQ-1 (critical): BUILD-03 dependency on the audit gate is missing.** BUILD-03 (autoUpdater wiring) `dependsOn: [BUILD-02, BUILD-04]`. But the whole point of TOOL-04 / the teardown's hard-sequencing rule is **the CI audit gate (BUILD-01) must land first or no installer is produced at all.** BUILD-02 depends on BUILD-01, so it's transitively covered — but **BUILD-03's verification ("Two-build test v(N)→v(N+1)") cannot run without a CI-produced installer**, which requires BUILD-05 (CI publish) too. BUILD-03 does **not** depend on BUILD-05, yet its DoD is unverifiable without it. Add `BUILD-05` to BUILD-03's effective verification chain, or move the two-build test to a separate gated step.

**SEQ-2 (critical): the auto-update channel is NOT a Sprint 0 deliverable, contradicting the PO's binding "auto-update-first / shipping in build #1" decision.** BUILD-02/03/05 are all `suggestedSprint: Sprint 1`. The PO release plan R0 says *"electron-updater ... shipping in THIS build (build #1)."* **The dev streams defer the entire channel to Sprint 1.** This is a head-on contradiction between the PO's strategic bet and the actual task scheduling. Either:
- (a) the channel genuinely ships Monday → BUILD-02/03/05 must move to Sprint 0 (and the deadline math in §4 gets much worse), or
- (b) the channel is honestly a Tue–Thu fast-follow → the PO's "build #1" language and R0 gate criterion #3 ("autoUpdater.checkForUpdatesAndNotify fires on launch") are **false advertising** and must be rewritten.

The Scrum Master cannot finalize a plan whose gate criteria (R0 #3) reference a deliverable its own tasks schedule for the next sprint. **Resolve the contradiction explicitly.**

**SEQ-3: VIEW-HOOK / QUAL-02 are duplicate tasks for the same refactor in different streams with inconsistent dependencies.** VIEW-HOOK `dependsOn: [VIEW-01, VIEW-02]`. QUAL-02 `dependsOn: []`. They touch the identical five files and both claim to be "the" extraction. If both are dispatched, two agents rewrite the same three viewers. **They must be merged into one task with one owner and one dependency set** (`[VIEW-01, VIEW-02]` is correct — the hook must absorb the Sprint-0 fixes). As written this is a guaranteed merge collision and a planning-integrity failure.

**SEQ-4: STATE-06 declares `dependsOn: []` but its own parallelSafe note says it MUST run after the hook extraction.** The dependency array is wrong — it should be `dependsOn: [VIEW-HOOK]` (or QUAL-02). A dependency described in prose but absent from the machine-readable `dependsOn` will be dispatched early and rebased away. Same defect in **A11Y-01** (`dependsOn: [QUAL-02]` is present — good) vs **TOOL-13** (`dependsOn: [TOOL-10]`, but TOOL-10 itself depends on the hook via TOOL-06 only loosely). Audit every "must run after X" prose note and make it a real `dependsOn` edge.

**SEQ-5: DEP-01 (vuln remediation) reverts BUILD-01 but nothing sequences the re-enable against CI-01.** DEP-01 "Once high=0, revert BUILD-01" and CI-01 "re-enable the audit gate as a hard gate" are the same action owned by two streams (DEP-01 in build/dependency-health, CI-01 in quality, R3). Cross-stream double-ownership of the audit-gate re-enable → either both fire (one fails) or neither does. Assign single ownership.

**SEQ-6: AUTH-06 single-flight lock should arguably precede, not follow, the Monday fan-out exposure.** AUTH-06 is Sprint 2, `dependsOn:[AUTH-01, AUTH-05]`. Its own rationale says the lock is "strongest AFTER AUTH-01 removes the destructive logout." Correct — but note AUTH-01 alone (Sprint 0) leaves the concurrent-`persistCache` write race live for Monday. That's an acceptable risk *only if* explicitly acknowledged; the plan treats it as fully closed by AUTH-01. Flag the residual.

**Sequencing that is CORRECT (credit where due):** AUTH-01 → AUTH-05 → AUTH-06 serialization on `getAccessToken`; the powerbi-api.ts single-worktree sub-stream (RESIL-01→02→03→API-01/02→API-03); VIEW-HOOK after VIEW-01/02. These are well-reasoned.

---

## 3. FALSE PARALLELISM (parallelSafe collisions that will cause merge chaos)

**FP-1 (worst): `src/main/index.ts` is a five-way concurrent write with NO serializing owner.** Tasks editing `index.ts` and marked `parallelSafe: "Partial"` or worse:
- SEC-01 (CSP), SEC-02 (single-instance lock), SEC-03 (window-open handler), BUILD-03 (autoUpdater), BUILD-04 (electron-log), **TEL-01** (electron-log — *duplicate of BUILD-04!*), **TOOL-12** (observability electron-log — *triplicate!*), TOOL-09 (autoUpdater — *duplicate of BUILD-03!*).

Every one of these edits `app.whenReady`. The BUILD stream openRisk admits "BUILD-02/03/05 + SEC-01/02/03 edit index.ts app.whenReady — worktree-isolate" but **the plan never designates a single `index.ts` owner**, and it has **three separate electron-log tasks (BUILD-04, TEL-01, TOOL-12) and two autoUpdater tasks (BUILD-03, TOOL-09)** that will each independently add imports and `app.whenReady` blocks to the same file. This is not "partial" parallelism — it is a guaranteed conflict. **Correction:** Collapse BUILD-04/TEL-01/TOOL-12 into one telemetry task and BUILD-03/TOOL-09 into one autoUpdater task; assign one agent to own `index.ts` for the whole effort (mirroring the auth stream's "one owner for auth-service.ts" discipline, which is the right model).

**FP-2: `src/shared/constants.ts` — VIEW-06, VIEW-07, QUAL-03, API-02 all add constants, several marked parallelSafe.** The viewer stream openRisk catches VIEW-06/VIEW-07. But **API-02** (status-code message table in constants.ts) and **QUAL-03** (slideshow constants) also touch it and are in *different streams* with no cross-stream coordination noted. Designate one constants.ts owner.

**FP-3: `auth-store.ts` cross-stream collision is under-flagged.** STATE-01 (logout eviction), AUTH-01 (checkAuth error text), AUTH-07 (warning intent) all edit `auth-store.ts` from **two different streams** (state + auth). The auth stream flags it internally; the state stream flags it; but no single owner is assigned across streams. Same for **`search-store.ts`** (STATE-01/02/03 + RESIL-03) and **`SearchDialog.tsx`** (STATE-03/05 + RESIL-03 + API-03).

**FP-4: TOOL-02 asserts "Lane C overlaps index.ts only via CSP read, not write" — this is false.** Lane B writes CSP/auth/single-instance to index.ts; Lane C is the viewers. But TOOL-02's own file list puts the viewer .tsx files in Lane C and index.ts in Lane B — fine — yet it then claims lanes are "near-disjoint." They are disjoint *between B and C*, but **A (build.yml) and the telemetry/autoUpdater tasks both write index.ts**, breaking the "four disjoint lanes" premise. The disjointness claim is the foundation of the Monday parallelization and it does not hold for index.ts.

**FP-5: DX-01 and VIEW-05 BOTH strip console + edit the vite config AND ReportViewer debug handlers.** DX-01 (`vite.config.ts` + ReportViewer.tsx) and VIEW-05 (`electron.vite.config.ts` + ReportViewer.tsx) are near-identical tasks in different streams — **and they disagree on the config filename** (`vite.config.ts` vs `electron.vite.config.ts`). One of them is wrong about the actual file. Merge and verify the real config path on disk.

---

## 4. DEADLINE RISK (is Sprint 0 achievable in ~2 days, Sat 06-06 → Mon 06-08?)

**The PO's own math is "~1.5 days of code." The realistic Sprint 0 task load is far higher.** Counting only `suggestedSprint: Sprint 0` tasks: BUILD-01, SEC-01, SEC-02, SEC-03, DIST-01, AUTH-01, AUTH-02, VIEW-01, VIEW-02, VIEW-03, VIEW-07, TEL-01, DX-01, plus the tooling gates TOOL-01..08. That is **~13 code tasks + 8 process tasks**, several of which (VIEW-HOOK is deferred, good; but VIEW-01/02/03 are per-viewer ×3 files each) fan into much more work than the effort tags suggest.

**Hidden long-poles the plan under-weights:**

1. **Auto-update cannot be end-to-end verified by Monday — and the plan's own tooling stream admits it.** TOOL-09/BUILD-03 DoD can only prove "update detected + downloaded," NOT "silently applied with a SmartScreen-clean relaunch," because **that requires a real GitHub Release and a second build to update *from*, and unsigned NSIS differential updates interact with SmartScreen/UAC on apply.** R0 gate criterion #3 demands `checkForUpdatesAndNotify` "fires on launch without crashing" — that's a weak bar (it fires against an empty/own feed and no-ops). The *channel works* claim is unfalsifiable until R1 actually ships through it. **The PO's "the channel exists from build #1" is true only in the trivial "code is present" sense, not the "proven to deliver a fix" sense.** This must be stated honestly in the gate.

2. **The packaged-build CSP verification (SEC-01) requires a full `package:win` cycle per iteration**, not `npm run dev`. Every CSP/updater/single-instance change re-verifies against a packaged artifact. On a Xeon W-11855M an electron-builder NSIS pack is multi-minute; budget for 5–10 package cycles = an hour-plus of pure build wait, serialized at the verification gate.

3. **`/security-review` (TOOL-05) is the hard exit gate and runs on the *merged* diff** — i.e. it cannot start until all four lanes land. If lanes finish Monday morning, the security gate + any remediation is itself a multi-hour serial tail with no slack before the ship.

4. **Zero regression net for all Sprint-0 fixes** (tests are R3). The viewer stream openRisk concedes "Monday's fixes rely entirely on /verify manual confirmation." Manual `/verify` of embed-spinner/focus-thrash **requires a live AAD session and a real Power BI tenant** — the tooling openRisk admits this "may not be fully scriptable" and falls back to "human-in-the-loop screenshot, slower and not exit-0 gateable." So **R0 gate criteria #4 and #8 (45s watchdog, heap-snapshot no-growth over 30-min cycling) are not exit-0 commands** — they are slow manual procedures dressed as gates (see §5).

**Over-scoped for Monday:** TEL-01 (electron-log) is Sprint 0 in the quality stream but the channel it supports (BUILD stream) is Sprint 1 — telemetry for a fast-follow you can't push until Sprint 1 is premature Monday work. DX-01 console-strip is correct to keep cheap, but it collides with the deferred VIEW-HOOK (see FP-5). **Recommend cutting TEL-01 to Sprint 1** to match its channel.

**Verdict:** Sprint 0 is achievable *only* if (a) the WIP is committed first (P0-1), (b) the auto-update channel is honestly descoped to "code present, not delivery-proven," and (c) the index.ts/constants.ts/store collisions are serialized under single owners. Without those three, the parallelization premise collapses and the 2-day estimate is optimistic by a wide margin.

---

## 5. DEFINITION-OF-DONE / VERIFICATION HOLES (prose dressed as gates)

The global rule (CLAUDE.md + PO ceremonies) is *"gate on a command that exits 0 — never on prose."* Multiple Sprint-0 verifications violate this:

- **R0 gate #8 / VIEW-02 / TOOL-10:** "30-min open/close cycling of 30+ reports shows no monotonic heap growth (DevTools heap snapshot)." **Not an exit-0 command.** It is a manual DevTools procedure with a subjective "monotonic" judgment, requiring a live tenant. TOOL-10 proposes a "deterministic heap assertion" harness — **that harness does not exist and isn't a scheduled task.** Either build the assertion (and schedule it) or stop calling this a gate.
- **VIEW-01 / R0 gate #4:** "actionable error+retry within 45s in all 3 viewers." Verified by manually toggling DevTools offline against a live embed. No automated gate until TEST-02 (Sprint 3). Honest label: "manual /verify, human-confirmed."
- **VIEW-03 / TOOL-07:** focus-thrash fix is explicitly "behavioral and cannot be unit-verified ... must be confirmed live in fullscreen with a real report containing slicers." This is fine as manual QA but **must not be counted toward an exit-0 sprint gate.**
- **AUTH-01 verification** uses `grep` for `logout()`/`clearCache()` — good, that *is* exit-0 — but "simulate expiry by deleting only the refresh token region / advancing clock" is hand-wavy; there's no concrete mechanism. Define the exact MSAL-cache manipulation or it won't be reproducible.
- **TOOL-01 verification** is literally "Grep the task transcripts ... manual checklist, 4/4 present." A process-compliance check, not a gate. Acceptable, but don't conflate it with a build gate.

**The pattern:** every runtime/behavioral Sprint-0 fix (the embed, focus, auth-relaunch, heap fixes — i.e. the *most important* day-one fixes) has a **manual, live-tenant, non-exit-0 verification.** The plan's DoD #3 demands behavioral `/verify`, which is correct, but the *sprint exit gate* must distinguish "exit-0 command gates" (tsc, /security-review, grep assertions, workflow_dispatch artifact) from "human-confirmed manual checks." As written, R0's 10-point gate mixes both and calls them all "ALL of." **Split the gate into hard (exit-0) and soft (human-confirmed) tiers so a failed manual check can't be silently waved through and a passed `tsc` can't masquerade as behavioral proof.**

---

## 6. RISK & ROLLBACK (the biggest strategic hole)

**RB-1 (critical): there is NO rollback plan for a bad Monday build, and the auto-update channel makes this WORSE, not better, in the unsigned state.** The PO's thesis is "auto-update turns every bug into a fast-follow." But consider the actual Monday failure mode:

- 20 users install the **unsigned** R0 build via SmartScreen click-through.
- The build is bad (e.g., the CSP fix breaks embeds in packaged mode — exactly the bug class the plan admits is "invisible in dev").
- The "fix" is a fast-follow through the **brand-new, never-end-to-end-tested** auto-update channel (which §4 establishes cannot be proven to *apply* a build before Monday).
- **If the update channel itself is broken, you have 20 users on a broken build with no delivery path — precisely the "20 manual reinstalls" scenario the channel was built to avoid, except now you've also burned the SmartScreen trust on a broken first impression.**

There is **no kill-switch, no staged rollout, no canary.** GitHub Releases + `checkForUpdatesAndNotify` pushes to **all 20 at once.** A bad auto-update auto-downloads and installs-on-quit for everyone simultaneously.

**Corrections the Scrum Master MUST add:**
1. **Staged rollout to the 20:** ship R0 to **2–3 pilot users first** (the plan already wants "≥2 real user machines or VMs" for R1 verification — make that a *gate before the other 17 get it*, not just an R1 observation). GitHub Releases supports this via a manual two-phase publish (release to pilots, then widen).
2. **A documented manual-reinstall rollback** for the case where the update channel itself fails (the channel is unproven — you need a fallback when your fallback is the thing that's broken). The DIST-01 SmartScreen guide should double as the rollback-reinstall guide with the **previous** known-good installer + its SHA-256 pinned.
3. **A kill-switch / pin mechanism:** the ability to *not* auto-update (or pin a version) if a bad build ships. `autoDownload:true` + install-on-quit (BUILD-03) means a bad build propagates with zero human gate. Add a server-side `latest.yml` rollback procedure (re-point the channel at the prior version) as the documented emergency lever.
4. **R0 gate #3 cannot be the channel's only proof.** Before relying on auto-update for *any* fast-follow, R1's first action must be a **real two-build apply test on a pilot machine** — and if it fails, the fast-follow strategy is invalid and the team is back to manual reinstalls. This contingency is unplanned.

**RB-2: `install-on-next-quit` + unsigned = SmartScreen/UAC re-prompt on every update.** The BUILD openRisk notes this ("Until DIST-02, BUILD-03 updates prompt SmartScreen/UAC on apply"). So the "zero manual touches" R1 gate criterion ("R0 users auto-update to R1 with zero manual touches") **is unachievable while unsigned** — the user gets a SmartScreen/UAC prompt on apply. **R1's headline gate criterion contradicts the unsigned-Monday decision.** Either the gate is wrong or the channel doesn't deliver its promise until DIST-02 (signing, R2). Rewrite R1's "zero manual touches" to "one UAC click-through, guide provided."

---

## SUMMARY — corrections the Scrum Master MUST apply, in order

| # | Severity | Correction |
|---|----------|------------|
| P0-1 | Blocker | Commit/stash the 44-file WIP on `sprint0-hardening`; add `git status` clean pre-flight gate before any worktree. The worktree strategy is currently building on a dirty tree. |
| P0-2 | Blocker | Inventory untracked `src/renderer/hooks/` + `src/shared/utils.ts` (already on disk) and reconcile with VIEW-HOOK/QUAL-02 before refactor planning. |
| SEQ-2/RB-2 | Blocker | Resolve the contradiction: auto-update channel is scheduled Sprint 1 but PO claims "build #1" and R0/R1 gates assume it works + applies with "zero touches." Rewrite gate criteria to match unsigned reality (UAC prompt on apply; channel "present" ≠ "delivery-proven"). |
| RB-1 | Blocker | Add staged/canary rollout (2–3 pilots before 17), a documented manual-reinstall rollback, and a version-pin/kill-switch. No rollback exists today. |
| FP-1 | High | Designate ONE owner for `index.ts`; collapse triplicate electron-log (BUILD-04/TEL-01/TOOL-12) and duplicate autoUpdater (BUILD-03/TOOL-09) tasks. |
| SEQ-3 | High | Merge VIEW-HOOK and QUAL-02 into one task/owner with `dependsOn:[VIEW-01,VIEW-02]`. |
| §1 | High | Map or explicitly disposition the 8 orphaned "Embed lifecycle" findings + `usage-store-read-throws-unhandled`. Pull `no-proactive-refresh-while-visible` (kiosk token death — primary use case), `usage-store-read-throws-unhandled` (won't-boot crash), and `dataset-refresh-info-success-on-failure` forward. Correct the PO's false "every finding mapped" claim. |
| §5 | High | Split R0's 10-point gate into hard (exit-0) vs soft (human-confirmed) tiers; #4 and #8 are manual, not commands. |
| FP-2/3/5 | Medium | Single owners for `constants.ts`, `auth-store.ts`, `search-store.ts`, `SearchDialog.tsx`; reconcile DX-01 vs VIEW-05 (duplicate + disagree on vite config filename). |
| SEQ-4 | Medium | Add missing `dependsOn` edges where prose says "must run after" (STATE-06→hook; audit every such note). |
| SEQ-1/5 | Medium | BUILD-03 verification needs BUILD-05; single-own the audit-gate re-enable (DEP-01 vs CI-01). |

**One genuine strength to preserve:** the auth stream's "one owner per file" discipline and the powerbi-api.ts sequenced sub-stream are the correct model — the failure is that this discipline was applied within streams but **not across them**, and not to `index.ts` at all.
