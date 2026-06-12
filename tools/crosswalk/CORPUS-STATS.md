# Crosswalk Corpus Stats

Aggregate statistics from local corpus run. No real table/measure/field/page names.

## Summary

| Metric | Value |
|---|---|
| Reports | 6 |
| Pages | 121 |
| Visuals (non-hidden tiles) | 898 |
| Supported visuals | 738 |
| Coverage | 82% |
| Tiles with compiled TREATAS filter | 166 |
| Tiles flagged filtersIncomplete | 228 |

## Visual Type Tallies

| Type | Count | Render Target |
|---|---|---|
| slicer | 255 | filter |
| pivotTable | 174 | ledger |
| actionButton | 87 | chrome (skipped) |
| tableEx | 81 | table |
| image | 65 | chrome (skipped) |
| card | 52 | kpi |
| cardVisual | 52 | kpi |
| columnChart | 42 | bar |
| pieChart | 27 | donut |
| clusteredColumnChart | 16 | bar |
| barChart | 8 | bar |
| FlowVisual (custom) | 6 | unsupported |
| asTimeline (custom) | 5 | timeline |
| heatmapCalendar (custom) | 5 | calendar |
| textFilter (custom, GUID-suffixed) | 4 | filter |
| donutChart | 4 | donut |
| waterfallChart | 3 | waterfall |
| bciCalendar (custom) | 3 | calendar |
| lineChart | 3 | line |
| esriVisual (custom) | 2 | unsupported |
| gauge | 1 | tickstrip |
| clusteredBarChart | 1 | bar |
| areaChart | 1 | area |
| Gantt (custom) | 1 | timeline |

## Top Diagnostics

| Code | Count | Notes |
|---|---|---|
| FILTER_OMITTED | 960 | Categorical filter not a simple In-values (Not/Comparison/Between/And/Or/compound/empty); omitted, tile flagged filtersIncomplete |
| FIELD_UNKNOWN_KIND | 47 | field expression with unrecognized structure |
| FILTER_FIELD_NOT_COLUMN | 6 | In-values Categorical filter whose field is not a Column; omitted, tile flagged |
| FIELD_NOT_OBJECT | 2 | field expression not an object |

The corpus carries 1228 Categorical filters; only ~249 are simple In-value
selections (compiled to KEEPFILTERS/TREATAS). The remainder are negations,
comparisons, ranges, or compound predicates that this pass deliberately omits
rather than mis-translate, each flagging its tile filtersIncomplete with a
diagnostic. No filter is ever silently dropped or silently inverted.

Note: filter coverage extended (Not-In/Comparison/Between/And-Or) after these stats; corpus re-run pending.
