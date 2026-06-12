# Crosswalk Corpus Stats

Aggregate statistics from local corpus run. No real table/measure/field/page names.

## Summary

| Metric | Value |
|---|---|
| Reports | 6 |
| Pages | 121 |
| Visuals (non-hidden tiles) | 898 |
| Supported visuals | 734 |
| Coverage | 82% |

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
| textFilter (custom) | 4 | filter |
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
| FIELD_UNKNOWN_KIND | 47 | field expression with unrecognized structure |
| FILTER_FIELD_NOT_COLUMN | 12 | Categorical filter field is not a Column |
| FILTER_OMITTED | 12 | filter omitted; tile flagged filtersIncomplete |
| FIELD_NOT_OBJECT | 2 | field expression not an object |
