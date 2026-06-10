# Mobile Rams Pass — subtraction charter

The phone app is judged against Dieter Rams' ten principles as practiced by
Jony Ive: minimal, useful, understandable, unobtrusive, honest, thorough.
This charter translates them into concrete, checkable work on `mobile/`.
The standard is subtraction under constraint — the pass REMOVES before it adds.

## Owner's verdicts driving this pass

- "Just a yellow line shaped like a dial that inches up like 4 times."
- "We can't see anything loading behind it and we have to look at it every
  time we view a report and go back."
- "This is again, just some basic tailwind."
- "I need to see something real." (live tenant data, not sample reports)

## The rules, applied

### 1. Unobtrusive — UI must be silent until needed
- Ignition ceremony: once per cold launch, never on navigation. (Shipped via
  the ignition rebuild; this pass verifies, does not redo.)
- No animation may repeat on routine navigation. Transitions are fast and
  quiet (250ms scale), never theatrical.
- Nothing pulses, bounces, or badges for attention unless something is
  actually BROKEN (red #E5484D is reserved for that alone).

### 2. Honest — the screen tells the truth
- Loading shows the layout filling in (skeletons), never a curtain.
- Sample-data mode must say it is sample data, visibly but quietly, on every
  screen that shows figures — one consistent "Sample data" wordmark, not a
  banner.
- Timestamps are real and absolute on press ("3h ago" expands to the actual
  time). No "fresh" styling on stale data.

### 3. As little as possible — the subtraction sweep
Audit every screen and delete:
- Decorative borders → replaced by seams (2px canvas gaps) or nothing.
- Redundant labels (a list titled "Reports" inside a tab named Reports).
- Duplicate affordances (two ways to do the same thing on one screen).
- Any color that is not canvas/surface/text/amber/red-for-broken.
- Any type size outside one modular scale; numerals tabular everywhere.

### 4. Understandable — hierarchy without instructions
- One hero element per screen; everything else subordinate.
- Order: status before detail, newest before oldest, broken before healthy.
- Empty states say what WOULD appear and the one action that produces it.

### 5. Thorough — the last 2%
- Safe-area correctness on notched phones, both orientations.
- Hit targets ≥ 44pt; pressed state = 80ms compress, 250ms spring release.
- Text never truncates data ambiguously (middle-truncate IDs, never amounts).
- Reduce Motion honored everywhere, including skeleton shimmer.

## Out of scope
- New features. This pass adds nothing the app does not already do.
- The ignition instrument itself (owned by the ignition rebuild).
- Desktop code, docs, workflows.

## Gates
- `cd mobile && npx tsc --noEmit` clean; existing tests pass.
- `npx expo export --platform ios` bundles clean.
- A before/after inventory in the PR description: every element REMOVED,
  listed. If the removed list is short, the pass failed.
