# Capture Harness Contract

## getTrackedRect selector

`getTrackedRect()` in `capture.mjs` measures `.luce-sheet` via `getBoundingClientRect()`.
`getBoundingClientRect` reflects CSS transforms applied to the measured node directly.

**Contract for Sprint-3 FLIP and all future morph implementations:**

The FLIP/morph transform MUST be applied to the same DOM node that `getTrackedRect()` measures (`.luce-sheet`, or update the selector here to match). If the transform is on a wrapper or pseudo-element while `.luce-sheet` stays at its static layout box, the rig measures a static rect and the morph cannot be proven.

Specifically:
- The animating `transform` (scale, translate, or matrix) must be on `.luce-sheet` itself.
- A wrapper `<div>` receiving the transform while `.luce-sheet` is an untransformed child will produce all-identical rects and fail `SELF-CHECK`.
- CSS `::before`/`::after` pseudo-element animations are invisible to `getBoundingClientRect` and will also fail.

If the node identity or selector changes in Sprint-3+, update `getTrackedRect()` in `capture.mjs` before re-running the harness.

## Honest baseline (VT, Sprint 1)

On the current View-Transition baseline the FLIP contract is not yet met. Genuine failures:

- `SELF-CHECK` open, close, interrupt: all-identical rects (VT moves pseudo-elements, not `.luce-sheet`).
- `A-1` open/close width+height: motion absent (`totalDelta=0px`), morph expected.
- `A-1` close-returns-origin: close lands at different y than open origin.
- `A-2` baseline-close: `present:false` throughout (sheet removed before VT fires).
- `A-3` interrupt: no measurable reversal.
- `A-4` interrupt: numeric snap `dy=142px` at rect pair 6->7.

`SELF-CHECK` reduced-motion: PASS (static is correct when `prefers-reduced-motion: reduce`).

Sprint 2 FLIP will keep `.luce-sheet` in the DOM and apply the animating transform directly to it, turning all these baseline failures into passes.
