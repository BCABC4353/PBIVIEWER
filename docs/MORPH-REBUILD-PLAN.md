# Insights Morph Rebuild — Implementation Plan

**Status:** ready to execute · **Author/Owner:** Scrum Master (lead session) · **Mode:** agent team, concurrent where non-sequential

> This document is the *execution plan*. Everything below describes how the **build** is orchestrated — the team, concurrency, antagonist reviews, screenshot gates, and self-heal loops happen during the build, not during authoring of this document.

---

## 1. Objective

Replace the Insights tile→sheet morph's distorting transform engine with **animate-real-geometry** (the approach validated by the research report), keeping the existing analytic spring. Eliminate the R4 anamorphic-scale defect by construction, restore the dead crossfade, fix the reduced-motion/a11y/robustness gaps, and **prove the result with true screenshots of the running board**.

Primary technique (decided): spring-driven real `left/top/width/height` on a `position:fixed` panel backed by a grid placeholder; SVG scales via its own `viewBox`. Library adoption (Framer Motion) is the **documented fallback** only if the kiosk 60fps gate fails (see §9).

## 2. Definition of Done — gate on commands that exit 0, never on prose

A sprint/task is complete only when its gate command(s) exit 0 **and** the named artifact exists. No self-reported "it works" is accepted.

| Gate | Command / artifact | Pass condition |
|---|---|---|
| G1 main typecheck | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 |
| G2 renderer typecheck | `npx tsc --noEmit -p tsconfig.renderer.json` | exit 0 |
| G3 lint | `npm run lint` | exit 0 |
| G4 unit tests | `npm test` | exit 0, 0 failed |
| G5 motion proof | `node harness/capture-real.mjs` → `harness/out/real-*.frames.json` | open: monotonic width+height growth Δ>50px; close: returns to origin rect (±2px); interrupt: measurable reversal, no numeric snap; reduced-motion: static rects |
| G6 no-scale proof | grep morph output path | the morph writes `left/top/width/height`; no `scale(` emitted on `.luce-sheet` during flight |
| G7 **true screenshots** | `node scripts/visual/shoot-board.cjs out/board.png out/sheet.png` + mid-flight frame PNGs from G5 | board PNG + expanded-sheet PNG exist and render real mock content; mid-flight frames show **no** anamorphic distortion (antagonist visual sign-off) |
| G8 kiosk perf | profiling artifact (see Sprint 3) | sustained ≥55fps median during open/close with lineage SVG mounted, OR documented fallback trigger |

Build prerequisite for all gates: `npm ci` then `AZURE_CLIENT_ID`/`AZURE_TENANT_ID` set to **non-zero** dummy GUIDs and `npm run generate-config` (all-zero GUIDs are rejected as placeholders). Never edit/commit `*.generated.ts`.

## 3. Team roster & assignments

Model tiering per house rules: Opus for reasoning/review/architecture, Sonnet for implementation, Haiku for mechanical.

| Member | Agent type | Model | Charter | No-code? |
|---|---|---|---|---|
| **Scrum Master** (me) | lead session | Opus | Decompose, dispatch, **actively poll** every dev each time control returns, gate, synthesize, re-dispatch unblocked work. | **Forbidden from writing any code.** |
| **DEV-A** Geometry/Spring core | `javascript-typescript:typescript-pro` | Sonnet | New lift/measure/interpolate-real-rect/restore lifecycle; delete `flip-geometry` transform path; keep `spring-physics.ts`; reset `timeScale`→~0.9–1.0. | writes code |
| **DEV-B** Crossfade & content swap | `frontend-mobile-development:frontend-developer` | Sonnet | Re-wire `sourceContentRef`/`targetContentRef`; tile face out by ~45%, detail in 20→80%; stacked absolute layers. | writes code |
| **DEV-C** SVG fidelity & lazy-mount | `ui-design:ui-designer` | Sonnet | `LineageDiagram` viewBox/`preserveAspectRatio`, `vector-effect:non-scaling-stroke` decision, lazy-mount heavy SVG on expand, foreignObject crispness. | writes code |
| **DEV-D** A11y & reduced-motion & robustness | `ui-design:accessibility-expert` | Sonnet | `aria-expanded` on tile, deliberate focus-return, remove/scope the aggressive `focusin`-pull, true instant reduced-motion path, fix single-RAF open no-op (`use-sheet-morph.ts`), reversal re-measure. | writes code |
| **DEV-E** Harness/capture/tests | `unit-testing:test-automator` | Sonnet | Update `harness/CONTRACT.md` + `getTrackedRect` for real-geometry node; keep/extend unit tests; run + collect all capture artifacts. | writes code |
| **PERF** Kiosk profiler | `application-performance:performance-engineer` | Opus | Profile per-frame reflow with SVG mounted; `contain: layout paint` A/B; produce frame-timing evidence; call the Framer Motion fallback if 60fps fails. | writes code (profiling only) |
| **ANTAGONIST-1** Correctness/Arch | `comprehensive-review:architect-review` | Opus | Attack logic: spring continuity on reversal, lifecycle correctness, leaks, contract integrity, test honesty. Grades against spec; never trusts dev self-report. | review only |
| **ANTAGONIST-2** Visual/UX truth | `comprehensive-review:code-reviewer` | Opus | Attack the *artifacts*: reads `frames.json` deltas and the PNG/GIF reels frame-by-frame for residual distortion, snap, pop-in, focus theft. | review only |

## 4. Tooling catalog (which plugin/tool at which step)

- **Recon:** `Explore` agent, `Grep`, `Glob`, `Read`.
- **Implementation:** `Edit`/`Write` (devs only).
- **Build config:** `npm ci`; `generate-config` with dummy GUIDs (PowerShell tool, ASCII-only, single bundled call).
- **Typecheck/lint/test:** `npx tsc` (both tsconfigs), `npm run lint`, `npm test` (Vitest).
- **Motion proof:** `node harness/capture-real.mjs` (Puppeteer headless, `/real.html`, `window.__morph.open/close/openThenInterruptAt/setSpeed`, `getTrackedRect`/`state`) → `harness/out/real-*.{frames.json,gif,notes.txt}`.
- **True screenshots:** `node scripts/visual/shoot-board.cjs <board.png> <sheet.png>` (Puppeteer + injected `electronAPI` mock stub → `/#/insights`, screenshots board, clicks `button[aria-haspopup="dialog"]`, screenshots sheet). Faithful: same renderer tree as the Electron shell, real mock snapshot, **no Azure**.
- **Full-shell smoke (secondary):** `npm run dev` Electron launch for one manual confirmation that the morph runs identically in the packaged renderer.
- **Fallback research (only if G8 fails):** context7 MCP (`resolve-library-id`→`query-docs` for `motion`).
- **Orchestration:** `Agent` (`run_in_background: true`), `SendMessage`, `TaskCreate`/`TaskUpdate`/`TaskList`.

## 5. Orchestration rules (binding for the build)

1. **SM never writes code.** SM only reads, dispatches, polls, gates, and synthesizes.
2. **SM never waits passively.** Every time control returns to SM, it: (a) `TaskList` for status; (b) checks each backgrounded dev's latest output; (c) reassigns anything stalled; (d) re-dispatches newly unblocked work. SM does not block on a single agent's reply.
3. **Concurrency:** non-sequential work runs as concurrent background agents dispatched in one message. Antagonists run **concurrently with each other** on different streams.
4. **Antagonist gate:** no stream advances on a dev's say-so. The owning antagonist must review against the spec and the gate command output.
5. **Self-heal loop:** if a gate fails or an antagonist finds something broken, the responsible **dev self-administers a fix** in the same sprint, then the **antagonist re-reviews**. Loop until the gate exits 0. Escalate to SM only if two heal cycles fail.
6. **Screenshots are mandatory for "done."** No stream is complete without its capture artifact (G5/G7).

## 6. Dependency graph

```
Sprint 0 (setup + baseline capture)
        │
Sprint 1  DEV-A geometry core  ── ANTAGONIST-1 ──┐   (serialized: foundation)
        │                                        │
        ▼                                        ▼
Sprint 2  ┌── DEV-B crossfade ───── ANTAGONIST-1 ┐
          ├── DEV-C svg/lazy ────── ANTAGONIST-2 │  (B,C,D concurrent;
          └── DEV-D a11y/robust ── ANTAGONIST-1 ┘   antagonists 1&2 concurrent)
        │
        ▼
Sprint 3  PERF profiling + reversal hardening ── ANTAGONIST-2 (frame evidence)
        │
        ▼
Sprint 4  DEV-E full capture reel + true screenshots ── ANTAGONIST-1 & -2 concurrent sign-off
```

## 7. Sprints

### Sprint 0 — Setup & baseline evidence  (~15–25 min)
| Task | Owner | Tools | Duration | Gate |
|---|---|---|---|---|
| 0.1 `npm ci`; generate-config with dummy GUIDs | DEV-E | PowerShell, `generate-config` | 5–8 min | install exits 0; generated files present |
| 0.2 Run G1–G4 on untouched tree (ground-truth baseline) | DEV-E | tsc×2, lint, vitest | 5–8 min | all exit 0 (known-green per prior review) |
| 0.3 **Capture BEFORE artifacts**: `capture-real.mjs` + `shoot-board.cjs` | DEV-E | Puppeteer scripts | 5–8 min | `out/baseline-*` + before-board/sheet PNGs exist (proves the distortion for the before/after) |
| 0.4 Antagonist confirms baseline distortion is visible in frames | ANTAGONIST-2 | Read PNG/frames.json | concurrent | written confirmation |

**SM action:** dispatch 0.1→0.2→0.3 sequentially (they chain), 0.4 concurrent with 0.3.

### Sprint 1 — Geometry core  (~30–45 min, serialized foundation)
| Task | Owner | Tools | Duration | Gate |
|---|---|---|---|---|
| 1.1 Replace transform path with real-geometry lift/measure/interpolate/restore on `position:fixed` panel + grid placeholder; keep `spring-physics.ts`; remove `flip-geometry` scale math; set `timeScale`≈0.9 | DEV-A | Edit, Read | 20–30 min | — |
| 1.2 Update affected unit tests (`use-shared-element-morph.test`, `flip-geometry.test`) to assert real-rect interpolation, no `scale()` | DEV-A | Edit, vitest | 5–10 min | G4 |
| 1.3 Adversarial review: spring velocity continuity on reversal, placeholder flow-collapse correctness, no residual transform, leak-safety | ANTAGONIST-1 | Read, run gates | 10 min | sign-off + G1–G4, G6 |
| 1.4 Interim motion proof | DEV-A | `capture-real.mjs` | 5 min | G5 open/close shows real rect deltas |

**Concurrency:** none — this is the spine. **Self-heal:** DEV-A fixes any G1–G6 failure, ANTAGONIST-1 re-reviews.

### Sprint 2 — Parallel fan-out  (~45–60 min, B/C/D concurrent)
Dispatched together in one message; ANTAGONIST-1 and ANTAGONIST-2 review concurrently.

| Task | Owner | Tools | Duration | Gate | Reviewer |
|---|---|---|---|---|---|
| 2B Restore crossfade (refs wired; tile out ~45%, detail in 20→80%) | DEV-B | Edit | 25–35 min | G1–G4 | ANTAGONIST-1 |
| 2C SVG viewBox/preserveAspectRatio + `non-scaling-stroke` decision + lazy-mount on expand + foreignObject crispness | DEV-C | Edit, `shoot-board.cjs` | 30–40 min | G1–G4, partial G7 | ANTAGONIST-2 |
| 2D `aria-expanded`, focus-return, scope/remove `focusin`-pull, true instant reduced-motion, single-RAF no-op fix, reversal re-measure | DEV-D | Edit, vitest | 30–40 min | G1–G4 | ANTAGONIST-1 |
| 2R-1 Concurrent review of 2B + 2D (logic, focus, contract) | ANTAGONIST-1 | Read, gates | concurrent | sign-off |
| 2R-2 Concurrent review of 2C (visual crispness in screenshots) | ANTAGONIST-2 | Read PNGs | concurrent | sign-off |

**SM polling cadence:** on every return of control, `TaskList` + check each of B/C/D background outputs; if one finishes early, immediately route its antagonist; if one stalls, re-dispatch. Combined gate after all three merge: G1–G7.

### Sprint 3 — Performance & integration hardening  (~30–40 min)
| Task | Owner | Tools | Duration | Gate |
|---|---|---|---|---|
| 3.1 Profile per-frame reflow with lineage SVG mounted; A/B `contain: layout paint`; capture frame timings during open/close | PERF | `capture-real.mjs`, perf trace | 20–30 min | G8 |
| 3.2 If <55fps median: apply `contain`/`will-change`/lazy-mount tuning; if still failing, **trigger Framer Motion fallback** (§9) and notify SM | PERF | Edit / context7 | conditional | G8 or documented fallback |
| 3.3 Review perf evidence is real (not synthetic), confirm no idle RAF leak | ANTAGONIST-2 | Read trace | 10 min | sign-off |

### Sprint 4 — Visual proof & final gate  (~25–35 min)
| Task | Owner | Tools | Duration | Gate |
|---|---|---|---|---|
| 4.1 Full reel: `capture-real.mjs` (all 4 scenarios) + `shoot-board.cjs` board+sheet AFTER shots | DEV-E | Puppeteer scripts | 10–15 min | G5, G7 |
| 4.2 Update `harness/CONTRACT.md` to reflect real-geometry node (transform no longer required on `.luce-sheet`; rect proof via getBoundingClientRect still valid) | DEV-E | Edit | 5 min | doc updated |
| 4.3 Side-by-side BEFORE/AFTER board+sheet+mid-flight frames | DEV-E | assemble | 5 min | artifact exists |
| 4.4 **Dual concurrent final sign-off**: ANTAGONIST-1 (all gates exit 0, tests honest) + ANTAGONIST-2 (no distortion/snap/pop-in in any frame) | ANTAGONIST-1 & -2 | Read all | concurrent | both sign off; G1–G8 |
| 4.5 Full-shell Electron smoke (secondary) | DEV-E | `npm run dev` | 5 min | morph runs in packaged renderer |

## 8. Screenshot / visual-proof protocol (mandatory)

"Successful completion" requires **true screenshots of the running app on the Insights page**, produced by:
1. `scripts/visual/shoot-board.cjs` — boots the real renderer with the mocked `electronAPI` snapshot, navigates to `/#/insights`, screenshots the **board**, clicks the first workspace tile, screenshots the **expanded sheet**. This is the "open app → navigate → true screenshot" path, automated and auth-free.
2. `harness/capture-real.mjs` — 40-frame reels of open/close/interrupt/reduced-motion with per-frame PNGs + `frames.json` rect telemetry, driven through the real `useSheetMorph` chain.
3. BEFORE (Sprint 0) and AFTER (Sprint 4) sets are compared. The morph is *proven* only when the AFTER mid-flight frames show crisp, correctly-proportioned content (R4) and the `frames.json` deltas confirm motion + clean reversal.

If any capture script is broken on this machine (missing `puppeteer`/`gifenc`/`pngjs`, port conflict, headless flag drift), the owning dev **self-administers the fix** (install dep, change port, adjust launch args) and ANTAGONIST reviews the fix before the reel is trusted.

## 9. Risk register & fallback

| Risk | Trigger | Response |
|---|---|---|
| Per-frame reflow can't hold 60fps on kiosk with SVG mounted | G8 fails after `contain`/lazy-mount tuning | **Fallback to Framer Motion** `layoutId` + `layout="position"` + separately-driven SVG viewBox anim; PERF leads, ANTAGONIST-1 re-reviews R4 mitigation. Documented, not silent. |
| Open path silently pops in (single-RAF bail) | observed in capture | DEV-D re-measures on robust signal/retry (Sprint 2D) |
| Reversal animates toward stale rect after resize/scroll | ANTAGONIST-1 finds in review | DEV-D re-measures rects on reversal (Sprint 2D) |
| Capture rig measures static rect (contract drift) | G5 all-identical rects | DEV-E updates `getTrackedRect`/`CONTRACT.md` (Sprint 4.2) |
| Two spring engines diverge (`createMomentumSpring` vs `createSpringTicker`) | review | out of scope for this rebuild; logged for follow-up |

## 10. Timeline summary

| Sprint | Wall-clock (orchestrated) | Concurrency |
|---|---|---|
| 0 Setup & baseline | 15–25 min | 0.4 ∥ 0.3 |
| 1 Geometry core | 30–45 min | serial |
| 2 Fan-out | 45–60 min | 3 devs + 2 antagonists concurrent |
| 3 Perf | 30–40 min | — |
| 4 Visual proof | 25–35 min | dual antagonist sign-off concurrent |
| **Total** | **~2.5–3.5 h** | — |

## 11. Files in scope

Keep: `src/renderer/lib/morph/spring-physics.ts`. Rework: `flip-geometry.ts` (delete scale math), `use-shared-element-morph.ts` (output channel), `use-sheet-morph.ts` (RAF bail), `morph-surface.tsx`. Touch: `components/insights/WorkspaceSheet.tsx`, `WorkspaceTile.tsx`, `InsightsPage.tsx`, `LineageDiagram.tsx`, `lineage-diagram.ts`, `reduced-motion.ts`, `insights-luce.css`. Test/proof: `src/renderer/lib/morph/*.test.*`, `harness/capture-real.mjs`, `harness/CONTRACT.md`, `scripts/visual/shoot-board.cjs`.
