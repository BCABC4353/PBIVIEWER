# Capture Harness Contract

## getTrackedRect selector

`getTrackedRect()` in `capture.mjs` measures `.luce-sheet` via `getBoundingClientRect()`.

**Important:** `getBoundingClientRect` returns the visual bounding box of the element including
any CSS transforms applied to it (per WHATWG spec). It reflects the post-transform rendered size,
not the pre-transform layout box.

**Contract for morph implementations:**

The morph MUST animate `.luce-sheet`'s real `left`, `top`, `width`, and `height` properties
(position:fixed geometry) so that `getBoundingClientRect` tracks the in-flight rect continuously
from tile size to sheet size. Since `getBoundingClientRect` includes CSS transforms, transform-based
animation on `.luce-sheet` would also be measurable — but the implementation uses real geometry,
not transforms.

In-harness detection: if `real-open.frames.json` shows constant `width`/`height` across all
`opening` phase frames and then a single-frame snap at the `open` phase boundary, the root cause
is a measurement-ordering bug — `open()` captured `sheetRect` from `.luce-sheet` while the node
still carried tile geometry (before real geometry was applied), so `interpolateRect(tile, tile, p)`
returns tile dimensions for all progress values `p` and only resolves correctly at settle time.
The node IS `.luce-sheet`, the animation IS writing real left/top/width/height to that node — the
bug is that the destination rect was sampled too early, not that the wrong node is being animated.

## Post-S1 observed behavior (pre-fix, measurement-ordering bug)

After the S1–S3 implementation but before the sheetRect ordering fix, `real-open.frames.json` shows:
- Frame 0 (phase=`idle`): rect 357×124 px at tile position.
- Frames 1–14 (phase=`opening`, progress 0.648→1.001): rect CONSTANT at 357×124 px.
- Frame 15+ (phase=`open`): rect snaps to 624×485 px.
- Root cause: `open()` measured sheetRect while `.luce-sheet` still held tile geometry, so the
  interpolation target was tile rather than the intended sheet dimensions. The crossfade reveals
  content inside the static tile-sized box rather than a growing box.

DEV-A is fixing the measurement-ordering bug. The authoritative AFTER capture will be re-run once
that fix lands. See the BEFORE/AFTER index below for current artifact paths.

## Honest baseline (VT, Sprint 1)

On the View-Transition baseline the FLIP contract was not met. Genuine failures:

- `SELF-CHECK` open, close, interrupt: all-identical rects (VT moves pseudo-elements, not `.luce-sheet`).
- `A-1` open/close width+height: motion absent (`totalDelta=0px`), morph expected.
- `A-1` close-returns-origin: close lands at different y than open origin.
- `A-2` baseline-close: `present:false` throughout (sheet removed before VT fires).
- `A-3` interrupt: no measurable reversal.
- `A-4` interrupt: numeric snap `dy=142px` at rect pair 6->7.

`SELF-CHECK` reduced-motion: PASS (static is correct when `prefers-reduced-motion: reduce`).

## BEFORE/AFTER index

Board and sheet screenshots:
- BEFORE board: `harness/out/before-board.png`
- BEFORE sheet: `harness/out/before-sheet.png`
- AFTER board:  `harness/out/after-board.png`
- AFTER sheet:  `harness/out/after-sheet.png`

Reels (frames.json + gif):
- BEFORE (baseline-*): `harness/out/baseline-open.*`, `baseline-close.*`,
  `baseline-open-then-reverse-at-40.*`, `baseline-reduced-motion.*`
- AFTER (real-*): `harness/out/real-open.*`, `real-close.*`,
  `real-open-then-reverse-at-40.*`, `real-reduced-motion.*`

Per-frame PNGs for visual review of distortion (real-open scenario, progress < 0.5):
Visual reviewers must inspect these frames for smooth growth vs. jump/distortion:
- `harness/out/real-open/frame-000.png` (progress=0.0011, tile geometry)
- `harness/out/real-open/frame-001.png` (progress=0.2104, ~20% through spring)
- `harness/out/real-open/frame-002.png` (progress=0.5313, crossing 50%)
These frames capture the first half of the open animation where distortion would be most visible.
Also scrutinize frame-016.png→frame-017.png boundary for any snap/flash artifact at phase transition.
