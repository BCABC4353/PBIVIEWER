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
- S3-primitive running in background (off morph/main w/ S1+S2). Briefed with the F4 same-node contract.

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
