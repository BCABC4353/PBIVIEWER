# Blast Radius — the expanding workspace tile (owner-designed, 2026-06-10)

The owner's spec, near-verbatim. This is the board's signature interaction.

## The interaction
- Each workspace strip is a TILE carrying summary data (status edge, worst
  pulse dots, counts).
- Click → the tile EXPANDS elegantly into an overlay that covers the board;
  everything behind it blurs. Second click (or Esc / backdrop) contracts it.
- During expansion the tile's existing items scale up and FILL IN additional
  datapoints as room becomes available; the reverse happens on contraction.
  (FLIP: the overlay grows from the tile's own rectangle on the settle
  spring — nothing teleports, the tile literally becomes the sheet.)
- Slow and deliberate by design: 400ms panel spring, staged content arrival.

## The content (the actual product)
Inside the expanded tile, items are organized BY TYPE — Dataflows first,
then Datasets — and show their DOWNSTREAM EFFECT:

- A failed/stale DATAFLOW lists the DATASETS that refreshed against it:
  these are FALSE POSITIVES — lastStatus says Completed, but the data
  behind the refresh is stale. Mark them honestly ("refreshed against
  stale data") — never green.
- Each false-positive dataset lists the REPORTS bound to it: these are
  the reports currently lying to clients. Name them.
- Healthy chains stay quiet (grayscale); the cascade lights up only the
  damage path: red at the dataflow root, amber down the chain.

## Data requirements (main process)
- InsightsRefreshable (datasets): + upstreamDataflowIds?: string[]
- InsightsSnapshot: + reports: Array<{ id; name; workspaceId; datasetId? }>
- Source: per-workspace GET /groups/{ws}/datasets/upstreamDataflows (the
  resolver already exists for freshness) + the workspace report listings
  already fetched for counts.

## Cascade rule v1 (pure, unit-tested)
suspect(dataset) := lastStatus === 'Completed'
  AND any upstream dataflow d where
      d.lastStatus === 'Failed'
   OR (d.lastSuccessTime && dataset.lastSuccessTime &&
       d.lastSuccessTime < dataset.lastSuccessTime)  // refreshed BEFORE flow
inaccurate(report) := report.datasetId ∈ suspects

## Phone
Same pattern confined to the screen: tile → full-sheet expansion (reanimated
spring + expo-blur backdrop), organized Dataflows/Datasets with the same
cascade, haptic detent on open and on close. Slow, deliberate, tactile.

## Standard
Judged in the render loop (screenshots) and on-device. The across-the-room
test applies to the expanded sheet too: the damage path must be findable in
one second from across the room.
