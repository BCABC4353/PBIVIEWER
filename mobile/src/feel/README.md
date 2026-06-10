# src/feel — the tactility layer

Motion is **weight**, haptics are **material**, and **stillness is the default**.
A healthy fleet sits quiet; motion appears only when something arrives, changes,
or answers your finger — **one accent of motion per screen**, never a parade.
Springs are translated *exactly* from the craft spec's SwiftUI values
(`stiffness = (2π/response)²`, `damping = ζ·2·√stiffness` — same oscillator as
`CASpringAnimation`): high damping, no toy bounce. Haptic verbs are semantic —
call sites say what happened (`confirm()`, `fault()`), never which generator
fires. Notification haptics are precious: flow completion only.

## App moment → primitive + haptic verb

| Moment | Primitive | Haptic |
|---|---|---|
| Alert / row arrives | `<Entrance index={i}>` | `fault()` (failure) / `warn()` — once per batch, newest only |
| Pull-to-refresh passes threshold | gesture uses `springs.gesture` | `thunk()` |
| Refresh completes successfully | — | `confirm()` |
| Any row / card / button press | `<PressableScale>` | `tap()` (built in, on pressIn) |
| Hero number / count updates | `<AnimatedNumber value={n}>` | — (`tap()` at most, on land) |
| Refresh in progress | `<Pulse active>` around the status glyph | — |
| Scrubbing the sparkline past points | sparkline drag | `detent()` (self rate-limited ≤30/s) |
| Content loading | `<Shimmer>` blocks mirroring layout | — |
| Screen / tab transition | `springs.nav` | — |
| Card expand / collapse | `springs.card` | `thunk()` on snap |

## Reduce Motion guarantee

`motionEnabled()` (cached `AccessibilityInfo.isReduceMotionEnabled` + live
`reduceMotionChanged` subscription) gates **every** primitive: drop-ins become
fades in place, the press scale becomes an opacity dip, `Pulse` holds a static
0.7, `Shimmer` swaps its sweep for a gentle 0.6↔1.0 opacity pulse. Nothing
translates or scales when the OS asks for stillness. Haptics honor a single
master switch — `setHapticsEnabled(false)` — for the user setting.

Pure logic (spring math, stagger, detent gate, formatting) lives in
`motionCore.ts` (node-testable, no RN imports); RN bindings live in
`springs.ts` / `haptics.ts` / `primitives.tsx`.

## Ignition Sweep — the signature primitive

**Concept.** The Fleet screen's loading state is a car's gauge-needle sweep at
ignition. `<IgnitionSweep>` draws a 270° amber tachometer arc (gap at the
bottom) whose needle — an `Animated.Value` chasing the host's `progress` on
`springs.gesture` — sweeps as the fleet snapshot loads. Each batch of items the
API actually answers ticks one `detent()` under the thumb (self rate-limited).
On a clean load the needle settles flush on the end-stop and ONE warm
`confirm()` fires as `onSettled` cues the hero number to land. If the load
includes a failure the sweep **catches**: the needle halts at a proportional
position (capped at `CATCH_CEILING` = 0.92 — a full sweep is the visual
signature of a *clean* load, so a catch never lands flush), `fault()` fires,
and `onCaught` reports the catch so the host can surface the failed item in
red. Red belongs to the broken item, never to this chrome — the arc stays
amber.

Props: `{ progress: 0..1, itemsChecked: number, failed: boolean,
onSettled?: () => void, onCaught?: () => void, size?: number }`. Settle and
catch are terminal — later prop noise (progress regressions, late `failed`
flips) can never revive a finished gauge. Pure brain (arc dash math, honest
detent counting, the settle/catch state machine) lives in `ignition-logic.ts`,
tested in `ignition-logic.test.ts`; the component is only the SVG/haptic shell.

**The honesty rule.** Every detent is caused by a real API response landing —
`itemsChecked` increments map 1:1 to answers received. The sweep never fakes
delay, never synthesizes ticks, never eases toward 100% on a timer, and never
holds a finished load hostage to finish an animation. If data arrives
instantly, the needle sweeps once and settles instantly. Decreases and garbage
inputs in `itemsChecked` are silence, not clicks.

**Host contract (FleetHealthScreen).** Ideally the host exposes per-workspace
progress: `progress = workspacesAnswered / workspacesTotal` and
`itemsChecked = refreshables received so far`, flipping `failed` the moment any
response shows a failure — the needle then catches *where* the failure
surfaced. The current `DataSource.getFleetSnapshot()` resolves once; that's
fine: the host may derive progress as indeterminate → `1.0` on resolve (hold
`progress` low, e.g. `0.1`, while in flight, then set `1.0` + final
`itemsChecked` + `failed` together). The sweep still works — the completion
batch yields one detent, then the settle (or the catch at `CATCH_CEILING`,
visibly short of complete). Under OS Reduce Motion there is no sweep at all:
instant settle to the final position and a single completion haptic only — no
detents.
