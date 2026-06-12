# NIGHT 3 LEDGER

Orchestrator: lead session (Opus). One agent per worktree. Reconciled on every return of control.

## Baseline (night3/main) — VERIFIED GREEN
- typecheck: exit 0
- lint: exit 0 (2 known react-hooks warnings: primitives.tsx:108, BlastRadius.tsx:135)
- tests: 659 passed (32 files)
- expo export web: exit 0
- Checkpoint pushed: night3/main @ baseline

## Task 0 — Corpus re-run (orchestrator) — DONE
- Ran tools/crosswalk/cli.mjs over corpus -> night-out/corpus (gitignored).
- Extended pipeline translated 16 more filters (all Not-In); FILTER_OMITTED 960->943.
- No Comparison/Between/And-Or filters exist in corpus.
- Spot-check: DENIAL PAYOR CATEGORY Not-In faithful to PBIR; sibling null-literal Not-In correctly omitted.
- No filter family reverted. CORPUS-STATS.md refreshed + committed (b49b18b).

## Squads

| Squad | Branch | Worktree | Agent | Status |
|---|---|---|---|---|
| W — Enhancement Wiring | night3/enhance-wire | fleet-n3-W | squad-W (sonnet) | PASS R2 (commits 0b374ce+f6e69f2, 686 tests). Q1 wired (control bands whiteAlpha + orange anomaly flags), KpiTile directional. Mechanical OK (5 files <300, no comments). Antagonist F-W reviewing. Q2-Q5 -> owner. |
| M — Morph Drill Screen | night3/drill | fleet-n3-M | squad-M (sonnet) | PASS R1 (b8a4f94, 701 tests verified by F-M). F-M verdict SOLID+1 HIGH (VM-level C1 test re-proves library not M's wiring) + 2 MED (0.01 tol too loose; test file 388>300). SENT BACK for fixes; F-M to verify. |
| S — Skia Graduation (QUARANTINE) | night3/skia-grad | fleet-n3-S | squad-S (sonnet) | DISPATCHED (running) |

Worktrees: W/M junction node_modules -> fleet-n3. S own real install (675 pkgs, skia). S merged night3/main into skia-spike (lockfile conflict resolved to spike base + install; baseline 659 tests green post-merge).

## Antagonists
| Target | Agent | Status |
|---|---|---|
| Squad M (night3/drill) | antagonist-FM (Opus) | R1 done: SOLID+1HIGH+2MED. M fixing; F-M to verify fixes. |
| Squad W (night3/enhance-wire) | antagonist-FW (Opus) | DONE: CLEAN, no Crit/High, 686 tests verified. 1 LOW (4 dead-code helpers) -> W trimming. |

## Open QUESTIONS for owner (from Squad W board analysis)
- Q2 (W): No board shows a pareto cut-line / cumulative-share annotation on the Denials ledgers; ledgers already sort descending by data. Add a faint 80% threshold separator? where + what token?
- Q3 (W): No board places a distribution strip anywhere ("strip" on boards = tick-strip instrument only). Which series feeds it, which screen, where?
- Q4 (W): Ledger rows carry single-period {groups,value}; period deltas need prior-period data. Thread priorValue onto LedgerRow? Where does the delta render?
- Q5 (W): Which ledger tile gets which math enhancement (pareto fits CODES, deltas fit PAYOR)?
- (Q1 control-bands+anomaly on trend tile is an explicit directive, not a question -> sent back to W to implement. DONE.)
- M-note (motion boundary): DenialsDrillScreen's on-screen drill is an honest opacity-fade + height-snap, NOT a rendered geometric rect morph — there is no shared-element navigator in this Expo SDK56 scaffold. The morph-choreo spring/continuity engine drives the opacity curve. Disclosed by NAMED-TODO tests. True rect morph needs reanimated shared-values or a shared-element navigator (future squad). [M Q1: which approach?]
- M-Q2: should PARENT ledger nodes (MEDICARE, COMMERCIAL) also be drillable to a category-level slice, or leaves only?
- M-Q3: interim slice data shape — children-as-points vs week-over-week from the outset (for executeQueries later)?

## Reconciliation log
- Baseline + Task 0 complete; worktree setup next.
