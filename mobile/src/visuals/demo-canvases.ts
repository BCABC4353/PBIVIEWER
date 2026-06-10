/**
 * Demo report canvases — realistic CanvasSpecs with the DAX a live deployment
 * would run, plus a mock QueryResult per visual so the canvases render fully
 * offline. Live mode swaps `makeDemoRunner` for an executeDax-bound runner:
 *
 *   const runQuery = (dax: string) => executeDax(tokens, canvas.datasetId, dax);
 */
import type { CanvasSpec, QueryResult } from '../core/dax';

export interface DemoCanvas {
  id: string;
  /** Dataset a live runner would target. */
  datasetId: string;
  subtitle: string;
  spec: CanvasSpec;
  /** Mock result per visual, keyed by the visual's DAX string. */
  results: Record<string, QueryResult>;
}

const r = (columns: string[], rows: Array<Record<string, unknown>>): QueryResult => ({
  columns,
  rows,
});

// --- Sales Pulse ------------------------------------------------------------

const SALES_REVENUE_DAX = 'EVALUATE ROW("Revenue", [Total Revenue])';
const SALES_GROWTH_DAX =
  'EVALUATE ROW("Growth", DIVIDE([Total Revenue] - [Revenue PM], [Revenue PM]))';
const SALES_BY_MONTH_DAX =
  "EVALUATE SUMMARIZECOLUMNS('Date'[Month], \"Revenue\", [Total Revenue])";
const SALES_ORDERS_DAX =
  "EVALUATE SUMMARIZECOLUMNS('Date'[Date], \"Orders\", [Order Count])";
const SALES_CHANNEL_DAX =
  "EVALUATE SUMMARIZECOLUMNS('Channel'[Channel], \"Revenue\", [Total Revenue])";
const SALES_TOP_PRODUCTS_DAX =
  "EVALUATE TOPN(10, SUMMARIZECOLUMNS('Product'[Product], \"Revenue\", [Total Revenue], \"Units\", [Units Sold]), [Revenue], DESC)";

const SALES_PULSE: DemoCanvas = {
  id: 'sales-pulse',
  datasetId: 'a1b2c3d4-sales',
  subtitle: 'Revenue, orders, and channel mix',
  spec: {
    title: 'Sales Pulse',
    visuals: [
      { kind: 'kpi', title: 'Revenue MTD', dax: SALES_REVENUE_DAX, valueField: 'Revenue', format: 'currency' },
      { kind: 'kpi', title: 'vs Last Month', dax: SALES_GROWTH_DAX, valueField: 'Growth', format: 'percent' },
      { kind: 'bar', title: 'Revenue by Month', dax: SALES_BY_MONTH_DAX, labelField: 'Month', valueField: 'Revenue', format: 'currency' },
      { kind: 'line', title: 'Daily Orders — last 14 days', dax: SALES_ORDERS_DAX, labelField: 'Date', valueField: 'Orders', format: 'number' },
      { kind: 'donut', title: 'Revenue by Channel', dax: SALES_CHANNEL_DAX, labelField: 'Channel', valueField: 'Revenue', format: 'currency' },
      { kind: 'table', title: 'Top Products', dax: SALES_TOP_PRODUCTS_DAX },
    ],
  },
  results: {
    [SALES_REVENUE_DAX]: r(['Revenue'], [{ Revenue: 1_248_400 }]),
    [SALES_GROWTH_DAX]: r(['Growth'], [{ Growth: 0.062 }]),
    [SALES_BY_MONTH_DAX]: r(
      ['Month', 'Revenue'],
      [
        { Month: 'Nov', Revenue: 890_000 },
        { Month: 'Dec', Revenue: 1_120_000 },
        { Month: 'Jan', Revenue: 760_000 },
        { Month: 'Feb', Revenue: 840_000 },
        { Month: 'Mar', Revenue: 1_010_000 },
        { Month: 'Apr', Revenue: 1_090_000 },
        { Month: 'May', Revenue: 1_175_000 },
        { Month: 'Jun', Revenue: 1_248_400 },
      ],
    ),
    [SALES_ORDERS_DAX]: r(
      ['Date', 'Orders'],
      [312, 298, 305, 286, 341, 367, 224, 218, 330, 348, 352, 339, 361, 384].map((v, i) => ({
        Date: i < 4 ? `May ${28 + i}` : `Jun ${i - 3}`,
        Orders: v,
      })),
    ),
    [SALES_CHANNEL_DAX]: r(
      ['Channel', 'Revenue'],
      [
        { Channel: 'Online', Revenue: 512_000 },
        { Channel: 'Retail', Revenue: 388_000 },
        { Channel: 'Wholesale', Revenue: 236_000 },
        { Channel: 'Partner', Revenue: 112_400 },
      ],
    ),
    [SALES_TOP_PRODUCTS_DAX]: r(
      ['Product', 'Revenue', 'Units'],
      [
        { Product: 'Atlas Pro 13', Revenue: 214_000, Units: 1_180 },
        { Product: 'Atlas Pro 15', Revenue: 187_500, Units: 850 },
        { Product: 'Nimbus Dock', Revenue: 96_200, Units: 3_210 },
        { Product: 'Vector Sleeve', Revenue: 64_800, Units: 4_050 },
        { Product: 'Atlas Air', Revenue: 58_900, Units: 410 },
        { Product: 'Nimbus Hub 8', Revenue: 41_300, Units: 1_376 },
        { Product: 'Strata Stand', Revenue: 33_700, Units: 1_685 },
        { Product: 'Vector Cable 2m', Revenue: 21_400, Units: 7_133 },
        { Product: 'Strata Riser', Revenue: 18_200, Units: 910 },
        { Product: 'Nimbus Mini', Revenue: 12_600, Units: 630 },
      ],
    ),
  },
};

// --- Ops Overview -----------------------------------------------------------

const OPS_SUCCESS_DAX = 'EVALUATE ROW("SuccessRate", DIVIDE([Successful Refreshes], [Total Refreshes]))';
const OPS_USERS_DAX = 'EVALUATE ROW("ActiveUsers", DISTINCTCOUNT(Usage[UserId]))';
const OPS_DURATION_DAX =
  "EVALUATE TOPN(8, SUMMARIZECOLUMNS('Dataset'[Dataset], \"AvgMinutes\", AVERAGE(Refreshes[DurationMinutes])), [AvgMinutes], DESC)";
const OPS_USERS_HOUR_DAX =
  "EVALUATE SUMMARIZECOLUMNS('Time'[Hour], \"Users\", DISTINCTCOUNT(Usage[UserId]))";
const OPS_STORAGE_DAX =
  "EVALUATE SUMMARIZECOLUMNS('Workspace'[Workspace], \"GB\", SUM(Storage[SizeGB]))";
const OPS_SLOWEST_DAX =
  "EVALUATE TOPN(8, SUMMARIZECOLUMNS('Dataset'[Dataset], 'Dataset'[Workspace], \"Minutes\", MAX(Refreshes[DurationMinutes])), [Minutes], DESC)";

const OPS_OVERVIEW: DemoCanvas = {
  id: 'ops-overview',
  datasetId: 'e5f6a7b8-ops',
  subtitle: 'Refresh health, usage, and capacity',
  spec: {
    title: 'Ops Overview',
    visuals: [
      { kind: 'kpi', title: 'Refresh Success — 7d', dax: OPS_SUCCESS_DAX, valueField: 'SuccessRate', format: 'percent' },
      { kind: 'kpi', title: 'Active Users Today', dax: OPS_USERS_DAX, valueField: 'ActiveUsers', format: 'number' },
      { kind: 'bar', title: 'Avg Refresh Minutes by Dataset', dax: OPS_DURATION_DAX, labelField: 'Dataset', valueField: 'AvgMinutes', format: 'number' },
      { kind: 'line', title: 'Active Users by Hour', dax: OPS_USERS_HOUR_DAX, labelField: 'Hour', valueField: 'Users', format: 'number' },
      { kind: 'donut', title: 'Storage by Workspace', dax: OPS_STORAGE_DAX, labelField: 'Workspace', valueField: 'GB', format: 'number' },
      { kind: 'table', title: 'Slowest Refreshes', dax: OPS_SLOWEST_DAX },
    ],
  },
  results: {
    [OPS_SUCCESS_DAX]: r(['SuccessRate'], [{ SuccessRate: 0.964 }]),
    [OPS_USERS_DAX]: r(['ActiveUsers'], [{ ActiveUsers: 312 }]),
    [OPS_DURATION_DAX]: r(
      ['Dataset', 'AvgMinutes'],
      [
        { Dataset: 'Sales Perf', AvgMinutes: 14 },
        { Dataset: 'Finance Live', AvgMinutes: 11 },
        { Dataset: 'Inventory', AvgMinutes: 9 },
        { Dataset: 'Ops Daily', AvgMinutes: 6 },
        { Dataset: 'CRM Extract', AvgMinutes: 5 },
        { Dataset: 'HR Pulse', AvgMinutes: 4 },
        { Dataset: 'Mkt Spend', AvgMinutes: 3 },
        { Dataset: 'Web Traffic', AvgMinutes: 2 },
      ],
    ),
    [OPS_USERS_HOUR_DAX]: r(
      ['Hour', 'Users'],
      [4, 6, 18, 64, 122, 178, 201, 188, 162, 174, 149, 96, 41, 18].map((v, i) => ({
        Hour: `${(i + 6).toString().padStart(2, '0')}:00`,
        Users: v,
      })),
    ),
    [OPS_STORAGE_DAX]: r(
      ['Workspace', 'GB'],
      [
        { Workspace: 'BC Suite', GB: 41.2 },
        { Workspace: 'Data Engineering', GB: 28.7 },
        { Workspace: 'Finance', GB: 14.9 },
        { Workspace: 'Client Delivery', GB: 6.3 },
      ],
    ),
    [OPS_SLOWEST_DAX]: r(
      ['Dataset', 'Workspace', 'Minutes'],
      [
        { Dataset: 'Sales Perf', Workspace: 'BC Suite', Minutes: 22 },
        { Dataset: 'Finance Live', Workspace: 'Finance', Minutes: 17 },
        { Dataset: 'Inventory', Workspace: 'Data Engineering', Minutes: 13 },
        { Dataset: 'Ops Daily', Workspace: 'BC Suite', Minutes: 11 },
        { Dataset: 'CRM Extract', Workspace: 'Client Delivery', Minutes: 8 },
        { Dataset: 'HR Pulse', Workspace: 'BC Suite', Minutes: 6 },
        { Dataset: 'Mkt Spend', Workspace: 'Client Delivery', Minutes: 5 },
        { Dataset: 'Web Traffic', Workspace: 'Data Engineering', Minutes: 4 },
      ],
    ),
  },
};

export const DEMO_CANVASES: readonly DemoCanvas[] = [SALES_PULSE, OPS_OVERVIEW];

/**
 * Offline query runner for a demo canvas — resolves each visual's DAX to its
 * canned result after a short skeleton beat, like a fast Execute Queries call.
 */
export function makeDemoRunner(canvas: DemoCanvas): (dax: string) => Promise<QueryResult> {
  return async (dax: string) => {
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 350));
    const result = canvas.results[dax];
    if (!result) throw new Error('No data for this visual');
    return result;
  };
}
