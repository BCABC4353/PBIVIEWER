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
| Content loading | `<SkeletonPulse>` / `<Shimmer>` blocks mirroring layout | — |
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
