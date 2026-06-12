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
| W — Enhancement Wiring | night3/enhance-wire | fleet-n3-W | squad-W (sonnet) | COMPLETE+CLEARED. Final commit 7d99605 (chain 0b374ce->f6e69f2->7d99605), 675 tests. F-W: CLEAN no Crit/High; LOW dead-code trimmed. Ready to integrate. Q2-Q5 -> owner. |
| M — Morph Drill Screen | night3/drill | fleet-n3-M | squad-M (sonnet) | FIXED R2 (commit 10398cb, 702 tests). Addressed F-M HIGH (new VM-path C1 test in denials-drill-continuity.test.ts) + 2 MED (C0 tol 1e-4; split 388->213+178). F-M RE-VERIFYING. |
| S — Skia Graduation (QUARANTINE) | night3/skia-grad | fleet-n3-S | squad-S (sonnet) | REPORTED R1 (commit 7bf7794, 730 tests). All 6 components PASS, screenshot 8 canvases/0 errors. CONCERNS: changed brand.blueBacklit #156AD1->#5D9FEF + repointed direction.down (decision not QUESTION); stray uncommitted package.json + 3 debug-page*.mjs (NOT in commit, harmless). Antagonist F-S reviewing. NEVER MERGES. |

Worktrees: W/M junction node_modules -> fleet-n3. S own real install (675 pkgs, skia). S merged night3/main into skia-spike (lockfile conflict resolved to spike base + install; baseline 659 tests green post-merge).

## Antagonists
| Target | Agent | Status |
|---|---|---|
| Squad M (night3/drill) | antagonist-FM (Opus) | R1: SOLID+1HIGH+2MED. M fixed (10398cb). F-M RE-VERIFYING. |
| Squad W (night3/enhance-wire) | antagonist-FW (Opus) | CLEARED: CLEAN, no Crit/High, 686 verified. LOW trimmed (7d99605, 675 tests). |
| Squad S (night3/skia-grad) | antagonist-FS (Opus) | RUNNING (incl. token-semantics scrutiny). |

## Open QUESTIONS for owner (from Squad W board analysis)
- Q2 (W): No board shows a pareto cut-line / cumulative-share annotation on the Denials ledgers; ledgers already sort descending by data. Add a faint 80% threshold separator? where + what token?
- Q3 (W): No board places a distribution strip anywhere ("strip" on boards = tick-strip instrument only). Which series feeds it, which screen, where?
- Q4 (W): Ledger rows carry single-period {groups,value}; period deltas need prior-period data. Thread priorValue onto LedgerRow? Where does the delta render?
- Q5 (W): Which ledger tile gets which math enhancement (pareto fits CODES, deltas fit PAYOR)?
- (Q1 control-bands+anomaly on trend tile is an explicit directive, not a question -> sent back to W to implement. DONE.)
- M-note (motion boundary): DenialsDrillScreen's on-screen drill is an honest opacity-fade + height-snap, NOT a rendered geometric rect morph — there is no shared-element navigator in this Expo SDK56 scaffold. The morph-choreo spring/continuity engine drives the opacity curve. Disclosed by NAMED-TODO tests. True rect morph needs reanimated shared-values or a shared-element navigator (future squad). [M Q1: which approach?]
- M-Q2: should PARENT ledger nodes (MEDICARE, COMMERCIAL) also be drillable to a category-level slice, or leaves only?
- M-Q3: interim slice data shape — children-as-points vs week-over-week from the outset (for executeQueries later)?
- S-TOKEN (needs ruling): Squad S changed brand.blueBacklit #156AD1 -> #5D9FEF and repointed direction.down to blueBacklit, to match board 07's waterfall decrement blue. This is a GLOBAL directional-color semantics change. CLAUDE.md/HANDOFF name logo blue #0F4D97 + "backlit logo blue down" but never pinned the backlit hex; board 07 renders #5D9FEF. S decided rather than asked. Contained on quarantine branch (never merges). OWNER: is #5D9FEF the canonical backlit-blue / direction.down, or keep #156AD1? (If yes, the canonical tokens.ts on night3/main needs the same change in a future sprint.)
- S-Q1: D-DIN PRO font file (.otf/.ttf) not in assets/fonts/. Native tick-strip/KPI labels render system font until bundled (tryMatchFont null-safe, no crash). Provision placeholder or owner adds?
- S-Q2: Donut highlight currently index 0 (largest). Owner-selectable highlightIndex or always first/largest?
- S-Q3: Line band defaults 1.5sigma at window 5 — tighter (1) or looser (2)?

## Reconciliation log
- Baseline + Task 0 complete; worktree setup next.
