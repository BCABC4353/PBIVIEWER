/**
 * Native visuals library — the app's own design language for Power BI data.
 * Data via core/dax.ts; pixels via tokens. No embedded Microsoft canvas.
 */
export { VisualCard } from './VisualCard';
export { KpiTile } from './KpiTile';
export { BarChart } from './BarChart';
export { LineChart } from './LineChart';
export { DonutChart } from './DonutChart';
export { DataTable } from './DataTable';
export { highlight, seriesRest, seriesLine, areaFill, seriesShade, legendGlyph, legendGlyphs } from './palette';
export { DEMO_CANVASES, makeDemoRunner, type DemoCanvas } from './demo-canvases';
