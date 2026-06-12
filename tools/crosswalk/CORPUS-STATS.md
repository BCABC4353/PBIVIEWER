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
| Tiles with compiled TREATAS (In-values) filter | 166 |
| Tiles with compiled predicate filter (Not-In) | 12 |
| Tiles flagged filtersIncomplete | 223 |

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
| FILTER_OMITTED | 943 | Categorical filter still not translatable (Comparison/Between/And/Or/compound/empty, or Not-In carrying a null literal); omitted, tile flagged filtersIncomplete |
| FIELD_UNKNOWN_KIND | 47 | field expression with unrecognized structure |
| FILTER_FIELD_NOT_COLUMN | 6 | In-values Categorical filter whose field is not a Column; omitted, tile flagged |
| FIELD_NOT_OBJECT | 2 | field expression not an object |

The extended filter pipeline (Not-In / Comparison / Between / same-column
And-Or) translated 16 additional Categorical filters that the prior pass
omitted; all 16 are Not-In negations, compiled to
`KEEPFILTERS(FILTER(ALL(col), NOT(col IN {...})))`. FILTER_OMITTED accordingly
fell 960 -> 943. The corpus contains no Comparison, Between, or And-Or
Categorical filters, so those families are exercised only by unit tests, not
the live corpus.

In-value selections remain compiled to KEEPFILTERS/TREATAS (166 tiles). The
remaining omissions are compound multi-condition Where clauses, empty filters,
and Not-In filters that include a `null` literal (which cannot be expressed in
a DAX value list and so revert to omit-and-flag rather than mis-translate).
No filter is ever silently dropped or silently inverted; every omission flags
its tile filtersIncomplete with a diagnostic.

Spot-check (this run): the translated Not-In on `DENIAL PAYOR CATEGORY IN
{"", "<none>"}` matches its PBIR source exactly (column, values, negation).
A sibling Not-In on the same page carrying a `null` literal was correctly
omitted, not translated. Verdict: no translation looked wrong on real shapes;
no filter family reverted.
