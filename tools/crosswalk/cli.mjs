import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join, basename, resolve } from 'path';

const { readReport } = await import('./reader.ts');
const { buildReportManifests } = await import('./manifest.ts');

function usage() {
  process.stderr.write(
    'Usage: node --experimental-strip-types tools/crosswalk/cli.mjs <reportDir> --out <outDir> [--render-preview <manifestJson>]\n',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let reportDir = null;
  let outDir = null;
  let previewManifest = null;
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--out' && args[i + 1]) {
      outDir = args[i + 1];
      i += 2;
    } else if (args[i] === '--render-preview' && args[i + 1]) {
      previewManifest = args[i + 1];
      i += 2;
    } else if (!reportDir && !args[i].startsWith('--')) {
      reportDir = args[i];
      i++;
    } else {
      i++;
    }
  }
  return { reportDir, outDir, previewManifest };
}

function collectReportDirs(pathArg) {
  const abs = resolve(pathArg);
  if (!existsSync(abs)) {
    process.stderr.write(`Path not found: ${abs}\n`);
    process.exit(1);
  }
  if (existsSync(join(abs, 'definition', 'pages', 'pages.json'))) {
    return [abs];
  }
  return readdirSync(abs)
    .map((e) => join(abs, e))
    .filter((p) => existsSync(join(p, 'definition', 'pages', 'pages.json')));
}

function inferRender(vt) {
  const v = vt.toLowerCase();
  if (v === 'card' || v === 'cardvisual' || v === 'kpi') return 'kpi';
  if (v === 'columnchart' || v === 'clusteredcolumnchart' || v === 'barchart' || v === 'clusteredbarchart') return 'bar';
  if (v === 'linechart') return 'line';
  if (v === 'areachart') return 'area';
  if (v === 'piechart' || v === 'donutchart') return 'donut';
  if (v === 'waterfallchart') return 'waterfall';
  if (v === 'tableex') return 'table';
  if (v === 'pivottable') return 'ledger';
  if (v === 'gauge') return 'tickstrip';
  if (v === 'slicer' || v.startsWith('textfilter')) return 'filter';
  if (v.startsWith('astimeline') || v.includes('gantt')) return 'timeline';
  if (v.startsWith('bcicalendar') || v.startsWith('heatmapcalendar')) return 'calendar';
  return 'unsupported';
}

function buildCoverage(allTallies, allDiags) {
  const CHROME_TYPES = new Set(['actionbutton', 'image', 'textbox', 'text']);
  const SUPPORTED_RENDERS = new Set([
    'kpi', 'bar', 'line', 'area', 'donut', 'waterfall', 'table',
    'ledger', 'tickstrip', 'filter', 'timeline', 'calendar',
  ]);
  const totalByType = {};
  for (const tallies of allTallies) {
    for (const [type, count] of Object.entries(tallies)) {
      totalByType[type] = (totalByType[type] ?? 0) + count;
    }
  }
  const diagCounts = {};
  for (const d of allDiags) {
    diagCounts[d.code] = (diagCounts[d.code] ?? 0) + 1;
  }
  let supported = 0;
  let total = 0;
  for (const [type, count] of Object.entries(totalByType)) {
    total += count;
    if (!CHROME_TYPES.has(type.toLowerCase())) {
      if (SUPPORTED_RENDERS.has(inferRender(type))) supported += count;
    }
  }
  return {
    visualTypeTallies: totalByType,
    totalVisuals: total,
    supportedVisuals: supported,
    supportedPct: total > 0 ? Math.round((supported / total) * 100) : 0,
    diagnosticsByCode: diagCounts,
  };
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPreviewHtml(manifest, manifestPath) {
  const parsed = JSON.parse(manifest);
  const tiles = Array.isArray(parsed) ? parsed : (parsed.tiles ?? []);
  const title = Array.isArray(parsed) ? basename(manifestPath, '.json') : (parsed.displayName ?? basename(manifestPath));

  const tileCards = tiles.map((t) => {
    const groupList = (t.group ?? []).map((g) => `<li class="ref">${escHtml(g)}</li>`).join('');
    const measureList = (t.measure ?? []).map((m) => `<li class="ref">${escHtml(m)}</li>`).join('');
    return `<div class="tile">
  <div class="tile-header">
    <span class="tile-id">${escHtml(t.id)}</span>
    <span class="tile-render">${escHtml(t.render)}</span>
    <span class="tile-source">${escHtml(t.source)}</span>
  </div>
  <div class="tile-layout">x:${t.layout?.x} y:${t.layout?.y} w:${t.layout?.w} h:${t.layout?.h}</div>
  ${groupList ? `<ul class="refs group-refs">${groupList}</ul>` : ''}
  ${measureList ? `<ul class="refs measure-refs">${measureList}</ul>` : ''}
  ${t.dax ? `<pre class="dax-block">${escHtml(t.dax)}</pre>` : ''}
  ${t.filtersIncomplete ? '<div class="warn-tag">filtersIncomplete</div>' : ''}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Crosswalk Preview</title>
<style>
body { font-family: monospace; background: #111; color: #ccc; margin: 0; padding: 1rem; }
.tile { border: 1px solid #333; border-radius: 4px; padding: 0.75rem; margin-bottom: 0.75rem; background: #1a1a1a; }
.tile-header { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.4rem; }
.tile-id { font-weight: bold; color: #eee; }
.tile-render { background: #2a3a2a; color: #8f8; padding: 1px 6px; border-radius: 3px; font-size: 0.85em; }
.tile-source { color: #888; font-size: 0.8em; }
.tile-layout { font-size: 0.75em; color: #666; margin-bottom: 0.4rem; }
.refs { margin: 0.25rem 0; padding-left: 1.2rem; font-size: 0.8em; }
.group-refs .ref { color: #adf; }
.measure-refs .ref { color: #fca; }
.dax-block { background: #0d1117; border: 1px solid #2a2a2a; padding: 0.5rem; font-size: 0.75em; overflow-x: auto; white-space: pre; color: #c9d1d9; }
.warn-tag { color: #f80; font-size: 0.75em; margin-top: 0.3rem; }
</style>
</head>
<body>
<h1 style="color:#eee;font-size:1.1rem;margin-bottom:1rem;">Crosswalk Preview — ${escHtml(title)}</h1>
${tileCards}
</body>
</html>`;
}

const { reportDir, outDir, previewManifest } = parseArgs(process.argv);

if (previewManifest) {
  const content = readFileSync(resolve(previewManifest), 'utf-8');
  const htmlOut = resolve(previewManifest.replace(/\.json$/, '') + '-preview.html');
  writeFileSync(htmlOut, renderPreviewHtml(content, previewManifest), 'utf-8');
  process.stdout.write(`Preview written to ${htmlOut}\n`);
  process.exit(0);
}

if (!reportDir || !outDir) usage();

const reportDirs = collectReportDirs(reportDir);
if (reportDirs.length === 0) {
  process.stderr.write(`No .Report directories found under ${reportDir}\n`);
  process.exit(1);
}

mkdirSync(resolve(outDir), { recursive: true });

const allTallies = [];
const allDiags = [];
let totalReports = 0;
let totalPages = 0;
let totalVisuals = 0;

for (const dir of reportDirs) {
  const reportName = basename(dir, '.Report');
  const report = readReport(dir);
  totalReports++;
  totalPages += report.pages.length;
  allDiags.push(...report.diagnostics);

  const { manifests, tallies } = buildReportManifests(report.pages);
  allTallies.push(tallies);

  for (const manifest of manifests) {
    totalVisuals += manifest.tiles.length;
    allDiags.push(...manifest.diagnostics);
    const safeName = manifest.displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFile = join(resolve(outDir), `${reportName}__${safeName}.json`);
    writeFileSync(outFile, JSON.stringify(manifest.tiles, null, 2), 'utf-8');
  }
}

const coverage = buildCoverage(allTallies, allDiags);
const coverageFile = join(resolve(outDir), 'coverage.json');
writeFileSync(coverageFile, JSON.stringify({ reports: totalReports, pages: totalPages, visuals: totalVisuals, ...coverage }, null, 2), 'utf-8');

process.stdout.write(
  `Done: ${totalReports} reports, ${totalPages} pages, ${totalVisuals} visuals. Coverage: ${coverage.supportedPct}%. Output: ${resolve(outDir)}\n`,
);
