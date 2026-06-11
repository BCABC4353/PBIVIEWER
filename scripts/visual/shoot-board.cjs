// Screenshot the REAL desktop Insights board (Luce) with a stubbed electronAPI.
// Visual evidence harness: renders the REAL Insights board (stubbed
// electronAPI, rich mock fleet incl. a lit damage cascade) and saves PNGs.
// Local: npm i --no-save puppeteer && node scripts/visual/shoot-board.cjs out.png sheet.png
// CI: the visual-evidence workflow attaches these PNGs to every renderer PR.
const puppeteer = require('puppeteer');

const SNAPSHOT = {
  generatedAt: new Date().toISOString(),
  fromCache: false,
  workspaceCount: 8,
  reportCount: 64,
  dashboardCount: 12,
  partialFailure: false,
  failedWorkspaces: [],
  access: [],
  refreshables: [],
};
// Build a realistic fleet: per-workspace datasets/dataflows with histories.
const mk = (i, ws, kind, name, status, hoursAgo, runs, extra = {}) => ({
  kind, id: `${kind}-${i}`, name, workspaceId: ws.toLowerCase().replace(/ /g, '-'),
  workspaceName: ws, lastStatus: status,
  lastAttemptTime: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
  lastSuccessTime: status === 'Failed' ? new Date(Date.now() - (hoursAgo + 26) * 3600e3).toISOString()
                                       : new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
  lastRefreshType: i % 3 === 0 ? 'ViaApi' : 'Scheduled',
  scheduleSummary: 'Daily at 04:00, 12:00',
  recentRuns: runs.map((ok, j) => ({ ok, endTime: new Date(Date.now() - (runs.length - j) * 7200e3).toISOString(),
    ...(ok ? {} : { errorCode: 'ModelRefreshFailed', errorDetail: 'Credentials for the data source have expired.' }) })),
  ...extra,
});
let n = 0;
const W = ['BELL', 'FALLON', 'MEDIC', 'CATALDO', 'ARMSTRONG'];
for (const ws of W) {
  SNAPSHOT.refreshables.push(mk(n++, ws, 'dataset', `${ws} - Billing Model`, 'Completed', 2, [1,1,1,1,1,1,1,1,1,1,1,1].map(Boolean)));
  SNAPSHOT.refreshables.push(mk(n++, ws, 'dataset', `${ws} - KPI Model`, 'Completed', 5, [1,1,0,1,1,1,1,0,1,1,1,1].map(Boolean)));
  SNAPSHOT.refreshables.push(mk(n++, ws, 'dataflow', `${ws} - Staging Flow`, 'Completed', 3, [1,1,1,1,1,1,1,1].map(Boolean)));
}
SNAPSHOT.refreshables.push(mk(n++, 'MEDIC', 'dataset', 'MEDIC - Payor Admin', 'Failed', 9 * 24,
  [1,1,1,0,0,0,0,0].map(Boolean), { errorCode: 'ModelRefreshFailed', scheduleOverdue: true }));
SNAPSHOT.refreshables.push(mk(n++, 'BELL', 'dataset', 'BELL - Randomizer', 'Never', 0, [], {}));
SNAPSHOT.refreshables.push(mk(n++, 'FALLON', 'dataflow', 'FALLON - CRM Extract', 'InProgress', 0, [1,1,1,1,1,1].map(Boolean)));
SNAPSHOT.refreshables.push(mk(n++, 'CATALDO', 'dataset', 'CATALDO - Archive', 'Completed', 31 * 24, [1,1,1].map(Boolean)));
// Light the damage cascade: MEDIC's flow fails; its datasets refreshed against it.
const medicFlow = SNAPSHOT.refreshables.find((r) => r.name === 'MEDIC - Staging Flow');
medicFlow.lastStatus = 'Failed';
medicFlow.lastSuccessTime = new Date(Date.now() - 29 * 3600e3).toISOString();
for (const r of SNAPSHOT.refreshables) {
  if (r.workspaceName === 'MEDIC' && r.kind === 'dataset') r.upstreamDataflowIds = [medicFlow.id];
}
// Long names that used to ellipse in the sheet rows (owner v3 #6 evidence).
SNAPSHOT.refreshables.push(mk(n++, 'MEDIC', 'dataset', 'AUTO FINANCE REPORTING MODEL - PRODUCTION', 'Completed', 4,
  [1,1,1,1,1,1,1,1].map(Boolean), { upstreamDataflowIds: [medicFlow.id] }));
SNAPSHOT.refreshables.push(mk(n++, 'MEDIC', 'dataset', 'BILLING - CONSOLIDATED DASHBOARD FEED', 'Completed', 6,
  [1,1,1,1,1,1].map(Boolean), { upstreamDataflowIds: [medicFlow.id] }));
// FALLON at REAL scale: 20 dormant datasets + a never-run — the lineage
// diagram must fold the ash fleet into "+N more" (owner v3 #3 evidence).
for (let i = 0; i < 20; i++) {
  SNAPSHOT.refreshables.push(mk(n++, 'FALLON', 'dataset', `FALLON - Legacy Mart ${String(i + 1).padStart(2, '0')}`,
    'Completed', (400 + i * 25) * 24, i % 3 === 0 ? [1,1,1].map(Boolean) : [1,1].map(Boolean)));
}
SNAPSHOT.refreshables.push(mk(n++, 'FALLON', 'dataset', 'FALLON - Scratchpad', 'Never', 0, [], { lastAttemptTime: undefined, lastSuccessTime: undefined }));
SNAPSHOT.refreshables.push(mk(n++, 'FALLON', 'dataflow', 'FALLON - Forgotten Ingest Flow', 'Completed', 600 * 24, [1,1].map(Boolean)));
const dsId = (name) => SNAPSHOT.refreshables.find((r) => r.name === name).id;
SNAPSHOT.reports = [
  { id: 'rep-1', name: 'MEDIC - Executive Daily', workspaceId: 'medic', datasetId: dsId('MEDIC - Billing Model') },
  { id: 'rep-2', name: 'MEDIC - Claims Aging', workspaceId: 'medic', datasetId: dsId('MEDIC - KPI Model') },
  { id: 'rep-3', name: 'AUTO FINANCE BOARD PACK - MONTHLY REVIEW', workspaceId: 'medic', datasetId: dsId('AUTO FINANCE REPORTING MODEL - PRODUCTION') },
  { id: 'rep-4', name: 'BILLING - AR SUMMARY', workspaceId: 'medic', datasetId: dsId('BILLING - CONSOLIDATED DASHBOARD FEED') },
  { id: 'rep-5', name: 'FALLON - Weekly Ops', workspaceId: 'fallon', datasetId: dsId('FALLON - Billing Model') },
  { id: 'rep-6', name: 'FALLON - Legacy Pack 03', workspaceId: 'fallon', datasetId: dsId('FALLON - Legacy Mart 03') },
];

const STUB = `
(() => {
  const ok = (data) => Promise.resolve({ success: true, data });
  const SNAPSHOT = ${JSON.stringify(SNAPSHOT)};
  const explicit = {
    auth: {
      isAuthenticated: () => ok(true),
      getUser: () => ok({ id: 'u1', displayName: 'Brendan Cameron', email: 'brendan@bc-abc.com' }),
      validateToken: () => ok(true),
    },
    settings: {
      get: () => ok({
        theme: 'dark', sidebarCollapsed: true, slideshowInterval: 30, slideshowMode: 'pages',
        autoStartSlideshow: false, autoRefreshEnabled: false, autoRefreshInterval: 30,
        autoStartMode: 'off', usageClearOnLogout: 'never',
      }),
    },
    content: {
      getInsights: () => ok(SNAPSHOT),
      getAdminInsights: () => Promise.resolve({ success: false, error: { code: 'NOT_ADMIN', message: 'x' } }),
      getApps: () => ok([]), getWorkspaces: () => ok([]), getReports: () => ok([]),
      getDashboards: () => ok([]), getAllItems: () => ok([]),
    },
    usage: { getRecent: () => ok([]), getFrequent: () => ok([]), recordOpen: () => ok(undefined) },
  };
  const fallbackFn = () => Promise.resolve({ success: false, error: { code: 'STUB', message: 'stub' } });
  const ns = (name) => new Proxy(explicit[name] ?? {}, {
    get: (t, prop) => (prop in t ? t[prop] : fallbackFn),
  });
  window.electronAPI = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? ns(name) : undefined) });
})();
`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1.5 });
  await page.evaluateOnNewDocument(STUB);
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${process.env.VISUAL_PORT || 5180}/#/insights`, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2600)); // let the ignition ceremony finish
  await page.screenshot({ path: process.argv[2] || '/tmp/luce-baseline.png' });
  if (process.argv[3]) {
    const tiles = await page.$$('button[aria-haspopup="dialog"]');
    if (tiles.length > 0) {
      await tiles[0].click();
      // 650ms flight + waves to ~740ms (owner v3 #2) — wait for full settle.
      await new Promise((r) => setTimeout(r, 1400));
      await page.screenshot({ path: process.argv[3] });
      console.log('SHEET SHOT:', process.argv[3]);
    } else {
      console.log('NO TILES FOUND');
    }
  }
  await browser.close();
  console.log('SHOT:', process.argv[2] || '/tmp/luce-baseline.png');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
