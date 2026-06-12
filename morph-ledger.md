# MORPH REFACTOR — LEDGER

Scrum Master / Integrator: Claude (Opus 4.8). Owner away.
Working repo: clone of BCABC4353/PBIVIEWER at v2.2.16. Integration branch: `morph/main`.

## Baseline gate (morph/main, from main @ 3487de9)
- `tsc -p tsconfig.main.json` — PASS (exit 0)
- `tsc -p tsconfig.renderer.json` — PASS (exit 0)
- `npm run lint` — PASS (exit 0)
- `npm test` — PASS, 660/660 in 48 files
Cleared to build.

## Prime-directive watch (untouched, verified)
main/master, RELEASE_REQUEST, update-policy.json, .github/workflows/**, package.json version — NOT touched.

## Squads
| Squad | Mission | Branch | Worktree | Status |
|-------|---------|--------|----------|--------|
| S1 | spring-velocity: carry velocity through retarget | morph/s1-spring | ../morph-s1 | DONE (self-report): 670 tests, pushed. spring-physics.ts 121L + test 244L, luce-motion.ts 249L. zeta~0.9, k=400, c=36. NOTE: pre-existing updater.test.ts flake (passes on retry, in baseline too). Pending integrator re-gate. |
| S2 | flip-geometry: pure measure/invert math | morph/s2-flip | ../morph-s2 | DONE (self-report): 694 tests, pushed. flip-geometry.ts 85L + test 264L. Pending integrator re-gate. |
| S3 | morph-primitive: useSharedElementMorph | morph/s3-primitive | — | BLOCKED on S1,S2 |
| S4 | capture-harness: Chromium visual proof rig | morph/s4-harness | ../morph-s4 | DONE (self-report): rig built, baseline reel captured. 660 tests still green (harness excluded from build). Baseline HONESTLY fails A-1/A-2/A-3/A-4 (VT pseudo-elements unmeasurable from JS) = the before-story. window.__morph API documented. Pending integrator re-gate. |
| S5 | wire: replace View-Transition in InsightsPage | morph/s5-wire | — | BLOCKED on S3 |
| F | antagonist (fresh per review) | — | — | — |

## Sprint log
### Sprint 1 (parallel: S1, S2, S4) — DONE
- S1, S2, S4 dispatched as parallel background agents in isolated worktrees. All delivered + pushed.

### Sprint 2 — antagonists (parallel: F1, F2, F4) — IN PROGRESS
- F1 vs S1: VERDICT PASS (ship as-is). Money test proven falsifiable (naive v=0 restart fails it 3 ways).
  Minor non-blocker: dt-cap test (spring-physics.test.ts:193-196) is a smoke test, not a real cap test;
  integrator to tighten during merge.
- F2 vs S2: VERDICT PASS-WITH-FIXES. Geometry ships as-is (all 6 contracts proven to ~1e-14). Only "fix"
  is the gate-determinism concern re: updater flake (handled by gate protocol below). S2 over-reported
  line counts (actual 73L/226L).
- F4 vs S4: VERDICT PASS-WITH-FIXES. Headline holds: verify.mjs PASSES synthetic-good (exit 0),
  FAILS synthetic-bad (exit 1) for right reasons; app isolation airtight (660 green). Required fixes
  before harness carries FLIP evidence:
    F2 (MED): dead-band — fake 0.5-2px motion slips self-check + A-1 skip. Self-check must assert a
      MIN total span (e.g. >=20px), and A-1 must FAIL (not skip) when totalDelta<2 on a morph scenario.
    F1 (MED): S4 overstated baseline — A-1/A-2 actually skip-to-PASS on static rects; only
      close-returns-origin + baseline-close genuinely fail. Correct the notes/record.
    F3 (LOW): A-4 add numeric rect-snap backstop (scan adjacent present rects for dx>2||dy>2).
    F4 (LOW, S3/S5 tripwire): getTrackedRect prefers .luce-sheet (mounts at final size) — S3 MUST put
      the FLIP transform on the exact .luce-sheet node, or retarget the selector. Documented contract.

## SPRINT 2 INTEGRATION PLAN (Scrum Master)
1. Dispatch S4-fix (verify.mjs hardening: F1/F2/F3 + notes) — background, evidence-critical, needed before S3 capture.
2. Integrate S1 -> morph/main, re-gate. Tighten dt-cap test (F1-S1 nit) as integrator commit.
3. Integrate S2 -> morph/main, re-gate.
4. Build S3 primitive on reviewed S1+S2. MUST honor F4-tripwire: FLIP transform on .luce-sheet node.
5. S4 captures S3 demo with hardened verifier; A-1..A-6 must pass on the primitive's own demo.

## INTEGRATION LOG (morph/main)
- 8c33aa6 merged S1 spring-velocity. 0aaf3d2 integrator follow-up: split spring tests under 300L
  (spring-physics.test.ts + spring-physics-lifecycle.test.ts + shared spring-test-clock.ts), tightened
  the dt-cap test per F1. Gate: tsc x2 + lint clean, 670/670.
- merged S2 flip-geometry (--no-ff). flip-geometry.ts 85L, test 264L (both <300). Gate: tsc x2 + lint
  clean, 704/704. S1+S2 now on morph/main.
- S4-fix DONE (commit 17c6f33 on morph/s4-harness): all 4 F4 findings closed. Dead-band shut
  (1px creep now FAILs, 680px morph PASSes, identical FAILs). A-1 fail-not-skip. A-4 numeric snap
  backstop. Baseline record honestly corrected to 6 PASS / 10 FAIL (the true before-story).
  harness/CONTRACT.md documents same-node rule for S3/S5. App gate 660 green. verify.mjs 235L.
- S3-primitive DONE (728 tests). useSharedElementMorph hook + MorphSurface + MorphDemo. Same-node
  contract honored (transform on [data-morph-node]). Interrupt reuses SAME spring (object-identity test).
  Zero insights imports (portable). Integrator follow-up: split the 323L hook test under 300L via
  morph-test-harness.ts. Merged to morph/main. Gate 728/728.
- S4 harness merged to morph/main (commit da32fb1). Both S3 + harness now on morph/main.

### Sprint 2 EXIT GATE — capture+verify S3 primitive demo (S4-cap) — IN PROGRESS
- S4-cap dispatched (branch morph/s4-capture-s3): wire MorphDemo into capturable harness, reconcile
  window.__morph contract, install puppeteer, run hardened verify on A-1..A-6. Must PASS to exit Sprint 2.
- S4-cap DONE: PRIMITIVE VERIFY 16 PASS / 0 FAIL. A-1 grow 184->1400px + shrink to origin, A-2 present
  every animating frame, A-3 reverses, A-4 momentum (snapRatio=1.0 no snap), A-5 pointer free. GIFs in
  harness/out/primitive-*.gif. Added additive optional timeScale param (default 1, behavior unchanged)
  to slow the real spring for capture. Merged to morph/main. Gate 728/728.
  CAVEAT: S4-cap made 4 verify.mjs changes to pass, incl. A-1 close-origin tolerance 1px->12px (claims
  capture-timing artifact: spring overshoots ~9px then panel unmounts pre-settle). The agent that needed
  the pass also loosened the bar -> dispatched F-cap antagonist to audit honesty before Sprint 2 exits.

### Sprint 2 EXIT — antagonist audit of verifier honesty (F-cap) — DONE, SPRINT 2 EXITED
- F-cap (Opus) VERDICT PASS-WITH-FIXES: the 16/16 primitive PASS is HONEST. Proved the FLIP morph
  returns to origin within 0.32px (math + 2 independent captures); the "~9px overshoot" was FICTIONAL
  — a verifier measurement bug (A-1 compared close-settled p~0 vs openFrames[0] at p=0.019). baseline
  still FAILS 9 ways under modified verifier (contrast intact). Probed #2/#3/#4: each still FAILs a
  genuinely broken morph. timeScale confirmed a clean clock-stretch of the one real spring (728 green).
- INTEGRATOR FIX (commit 33468a1): reverted A-1 to ORIGIN_TOL=1, comparing open+close rects
  extrapolated to progress=0 (kills the artifact). Hardened A-4: absolute snap backstop
  (>max(150px,3x median)) + scan ALL animating pairs. Re-captured + re-verified:
    PRIMITIVE: 16 PASS / 0 FAIL at 1px bar. A-1 close-returns-origin d=(0.00,0.00,0.00,0.00).
    BASELINE: 7 PASS / 9 FAIL (exit 1) — before/after contrast holds.
  Gate: tsc main+renderer + lint clean, npm test 728/728. verify.mjs 298L.

## SPRINT 2 COMPLETE — morph/main holds S1+S2+S3+S4+evidence, 728 green, primitive proven 16/16 at spec bar.

## SPRINT 3 PLAN
- S5: wire InsightsPage to useSharedElementMorph; DELETE the View-Transition open/close path +
  ::view-transition CSS + --morph vars; WorkspaceTile/Sheet consume the primitive; KEEP all 46
  InsightsPage tests green; honor harness/CONTRACT.md (FLIP transform on the measured .luce-sheet node).
- S4: capture the REAL tile in the harness; verify A-1..A-6 on the real integration.
- F (fresh antagonist): attack integration — focus/a11y, reduced-motion, NO global pointer interceptor
  regression, reusability (primitive importable with only spring + flip files), 46 jsdom tests green.
- Integrator merges S5 with full gate. Then Sprint 4: MORPH-REPORT.md + push all branches.

### Sprint 3 — S5 wire — DONE + INTEGRATED
- S5 (branch morph/s5-wire): replaced VT sheet morph with useSharedElementMorph. morphRef -> .luce-sheet
  node (same-node contract). Deleted ::view-transition(sheet-morph) CSS + --morph vars. toggleFilter VT
  kept (literal 60ms for the one --morph-open ref). Broke the 689L InsightsPage god-file into
  use-sheet-morph.ts (68L), use-insights-data.ts (151L), InsightsAdmin.tsx (173L) + CSS split
  (luce-buttons/luce-motion/workspace-tile.css); InsightsPage now 181L. All insights files <300L.
  Integrator independently re-gated: tsc x2 + lint clean, 728/728, the 46 InsightsPage tests 46/46.
  Merged to morph/main; re-gated post-merge 728/728. SCOPE NOTE: S5 did more than pure wiring (god-file
  breakup + CSS split) — defensible under anti-god-code (morph wiring forced touching the 689L file),
  flagged for the integration antagonist to confirm behavior-preserving.

### Sprint 3 — verification (parallel): real-tile capture + integration antagonist — DONE
- S4-real (branch morph/s4-real): REAL Insights tile morph verify --real 16 PASS / 0 FAIL. A-1 grow
  366->880px / shrink, close-returns-origin d=(0,0,0,0)px PIXEL-PERFECT. A-2 present every animating
  frame. A-3 reverses. A-4 momentum snapRatio=0.7 (overshoots 40% then reverses). A-5 pointer free.
  real-*.gif + frames.json committed. Added additive optional timeScale (undefined=prod identical) +
  window.__HARNESS-gated __morphHandle shim (inert in prod/tests). verify.mjs A-4 narrowed near-transition
  ratio backstop to fire only above 150px abs cap (fixes false-positive at spring velocity-zero point).
  INTEGRATOR independently re-verified: real 16/16, primitive 16/16, baseline 7/9 FAIL (contrast holds),
  + injected a 600px teleport -> A-4 correctly FAILed (verifier still honest). 46 InsightsPage tests green
  with prod changes present. Merged to morph/main; re-gated 728/728.

## SPRINT 3 COMPLETE. morph/main = full FLIP morph wired into live Insights board, View-Transition
## deleted, REAL tile proven 16/16 at 1px spec bar, integration antagonist PASS, 728 tests green.

### Sprint 4 — MORNING REPORT — NEXT
- Write MORPH-REPORT.md: honest 5-line summary; per-squad status/branch/tests/antagonist findings+fixes;
  measured A-1..A-8 PASS/FAIL table w/ numbers; before(VT 7/9)/after(real 16/16) GIFs + interrupt money
  shot; REUSABILITY note + the F-int known-limitation (primitive imports from components/insights, not
  yet relocated to lib/morph) as an owner QUESTION; spring-param QUESTIONS (k=400,c=36,zeta~0.9 — feel
  needs owner eyes on a live build); exact verify commands. Push morph/main + all morph/* branches.
  Reconcile ledger. Stop.
- F-int VERDICT: OVERALL PASS. Test files byte-identical (git diff empty) -> 46 green are trustworthy.
  CSS-rule survival: no rule lost (only deliberate VT deletions + 1 dead-duplicate .luce-tile--active).
  Focus/a11y, A-5, A-7, same-node, reusability all PROVEN. Own gate: tsc x2+lint clean, 728/728.
  2 MINOR non-regressions: (a) settled={true} correctly retires a VT-snapshot hack (visual end identical);
  (b) PRE-EXISTING: primitive imports spring-physics + prefersReducedMotion from components/insights/,
  not lib/morph/ -> "portable with only spring file" not literally true today. Identical pre-S5, so not
  an S5 defect. -> REPORT as known limitation + owner QUESTION; do NOT restructure shared files now.

## Known pre-existing flake (NOT a morph regression)
`src/main/updater.test.ts > "survives an unfetchable policy without forcing or throwing"` (line 201).
Uses fake timers, no real network. Times out (5000ms) only under full-suite parallel CPU saturation;
passes 16/16 in isolation and passed the cold 660/660 baseline. Confirmed independently by S1, S2/F2.
It is main-process code, OUTSIDE morph scope — NOT touched.
INTEGRATOR GATE PROTOCOL: run `npm test`; if the ONLY failure is this updater timeout, re-run once with
bounded workers; a clean pass is authoritative. Morph code is gated additionally on the targeted suites
(spring-physics, flip-geometry, InsightsPage, luce-motion) which must be deterministically green.

## Reconciliation
(pending)
