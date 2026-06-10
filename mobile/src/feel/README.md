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
| Cold app launch (once, ever) | `<IgnitionOverlay>` | `apex()` at the overshoot apex |
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

## Ignition — the launch ceremony (once, ever, per cold start)

**Concept.** `<IgnitionOverlay>` (IgnitionSweep.tsx) is the app's ignition
moment: a 270° graduated instrument — minor/major tick arc, amber glow trail
at two intensities, a needle with a hub and counterweight tail — whose needle
makes ONE continuous underdamped sweep on the UI thread (Reanimated
`useAnimatedProps` over react-native-svg): accelerate to full throw, one
slight overshoot, settle. A single light `apex()` impact fires exactly at the
overshoot apex; nothing else buzzes. Red never appears here — the chrome is
amber only.

**The three rules.**

1. **Once per cold launch.** A module-level latch in `ignition-logic.ts`
   (`ignitionHasPlayed` / `markIgnitionPlayed`) survives every component
   unmount/remount and resets only when the JS bundle restarts. Tab switches,
   back-navigation, screen remounts, pull-to-refresh and data-mode switches
   can NEVER replay the ceremony.
2. **Loading never blocks content.** The overlay is a `pointerEvents="none"`
   veil mounted above the app shell (Root.tsx) — content (or `<SkeletonPulse>`
   placeholders) is laid out and interactive beneath it the whole time, and
   the veil fades out to reveal the app within `IGNITION_TOTAL_MS` (≤ 1400 ms,
   D6). Loading states themselves are quiet skeletons, never the dial, never
   a spinner-as-wall.
3. **Reduce Motion → no ceremony at all.** No sweep, no haptic, instant
   content (the overlay dismisses itself before animating).

Pure brain (the launch latch, arc dash math, needle throw + tick graduation,
spring physics, the ≤ 1400 ms timeline) lives in `ignition-logic.ts`, tested
in `ignition-logic.test.ts`; the component is only the Reanimated/SVG/haptic
shell.
