
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'docs', 'manual', 'screenshots');
const BASE_URL = 'http://localhost:5173/';


const SAMPLE_USER = {
  id: 'sample-user-id-001',
  displayName: 'Alex Johnson',
  email: 'alex.johnson@contoso.com',
};

const SAMPLE_WORKSPACES = [
  { id: 'ws-001', name: 'Sales & Marketing', isReadOnly: false, type: 'Workspace' },
  { id: 'ws-002', name: 'Finance Analytics', isReadOnly: true, type: 'Workspace' },
  { id: 'ws-003', name: 'Operations Dashboard', isReadOnly: false, type: 'Workspace' },
  { id: 'ws-004', name: 'HR Reports', isReadOnly: false, type: 'Workspace' },
];

const SAMPLE_REPORTS = [
  { id: 'rpt-001', name: 'Q4 Sales Performance', workspaceId: 'ws-001', embedUrl: '', datasetId: 'ds-001', reportType: 'PowerBIReport' },
  { id: 'rpt-002', name: 'Monthly Revenue Trends', workspaceId: 'ws-001', embedUrl: '', datasetId: 'ds-002', reportType: 'PowerBIReport' },
  { id: 'rpt-003', name: 'Budget vs Actuals', workspaceId: 'ws-002', embedUrl: '', datasetId: 'ds-003', reportType: 'PowerBIReport' },
];

const SAMPLE_DASHBOARDS = [
  { id: 'dash-001', name: 'Executive Summary', workspaceId: 'ws-001', embedUrl: '', isReadOnly: false },
  { id: 'dash-002', name: 'KPI Overview', workspaceId: 'ws-002', embedUrl: '', isReadOnly: true },
];

const SAMPLE_APPS = [
  { id: 'app-001', name: 'Sales Analytics Suite', publishedBy: 'Contoso IT', lastUpdate: '2025-10-15T12:00:00Z', description: 'Comprehensive sales reporting' },
  { id: 'app-002', name: 'Financial Performance', publishedBy: 'Finance Team', lastUpdate: '2025-11-01T09:30:00Z', description: 'Finance dashboards and reports' },
  { id: 'app-003', name: 'HR Analytics', publishedBy: 'People & Culture', lastUpdate: '2025-09-20T14:00:00Z', description: 'Workforce insights' },
];

const SAMPLE_RECENT = [
  { id: 'rpt-001', name: 'Q4 Sales Performance', type: 'report', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', lastOpened: '2025-12-05T10:30:00Z', openCount: 12 },
  { id: 'dash-001', name: 'Executive Summary', type: 'dashboard', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', lastOpened: '2025-12-04T15:00:00Z', openCount: 8 },
  { id: 'rpt-002', name: 'Monthly Revenue Trends', type: 'report', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', lastOpened: '2025-12-03T09:00:00Z', openCount: 5 },
  { id: 'rpt-003', name: 'Budget vs Actuals', type: 'report', workspaceId: 'ws-002', workspaceName: 'Finance Analytics', lastOpened: '2025-12-02T16:45:00Z', openCount: 3 },
];

const SAMPLE_FREQUENT = [
  { id: 'rpt-001', name: 'Q4 Sales Performance', type: 'report', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', openCount: 12 },
  { id: 'dash-001', name: 'Executive Summary', type: 'dashboard', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', openCount: 8 },
  { id: 'rpt-002', name: 'Monthly Revenue Trends', type: 'report', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing', openCount: 5 },
];

const DEFAULT_SETTINGS = {
  theme: 'dark',
  sidebarCollapsed: false,
  slideshowInterval: 60,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoRefreshEnabled: true,
  autoRefreshInterval: 10,
  autoStartMode: 'off',
  usageClearOnLogout: 'never',
};


function buildMockScript(opts = {}) {
  const {
    isAuthenticated = false,
    user = null,
    workspaces = [],
    reports = [],
    dashboards = [],
    apps = [],
    recent = [],
    frequent = [],
    settings = DEFAULT_SETTINGS,
    authError = null,
    version = '2.0.7',
    getAllItemsData = null,
  } = opts;

  const allItems = getAllItemsData ?? {
    workspaces,
    reports,
    dashboards,
    partialFailure: false,
    failedWorkspaces: [],
  };

  return `
    (function() {
      const user = ${JSON.stringify(user)};
      const workspaces = ${JSON.stringify(workspaces)};
      const reports = ${JSON.stringify(reports)};
      const dashboards = ${JSON.stringify(dashboards)};
      const apps = ${JSON.stringify(apps)};
      const recent = ${JSON.stringify(recent)};
      const frequent = ${JSON.stringify(frequent)};
      const settings = ${JSON.stringify(settings)};
      const allItems = ${JSON.stringify(allItems)};
      const isAuthenticated = ${JSON.stringify(isAuthenticated)};
      const authError = ${JSON.stringify(authError)};

      window.electronAPI = {
        auth: {
          login: async () => ({
            success: true,
            data: {
              success: !!user,
              user: user || { id: '', displayName: '', email: '' },
              reusedPreviousAccount: false,
            }
          }),
          logout: async () => ({ success: true, data: undefined }),
          getUser: async () => ({ success: true, data: user }),
          getAccessToken: async () => ({ success: true, data: { accessToken: 'mock-token', expiresOn: null } }),
          isAuthenticated: async () => ({ success: true, data: isAuthenticated }),
          validateToken: async () => ({ success: true, data: isAuthenticated }),
          switchAccount: async () => ({
            success: true,
            data: { success: !!user, user: user || { id: '', displayName: '', email: '' }, reusedPreviousAccount: false }
          }),
        },
        content: {
          getWorkspaces: async () => ({ success: true, data: workspaces }),
          getReports: async () => ({ success: true, data: reports }),
          getDashboards: async () => ({ success: true, data: dashboards }),
          getDashboard: async () => ({ success: true, data: dashboards[0] || { id: '', name: '', workspaceId: '', embedUrl: '', isReadOnly: false } }),
          getApps: async () => ({ success: true, data: apps }),
          getApp: async () => ({ success: true, data: apps[0] || { id: '', name: '', publishedBy: '', lastUpdate: '' } }),
          getAppReports: async () => ({ success: true, data: [] }),
          getAppDashboards: async () => ({ success: true, data: [] }),
          getEmbedToken: async () => ({ success: true, data: { token: 'mock', tokenId: 'mock', expiration: new Date(Date.now() + 3600000).toISOString() } }),
          exportReportToPdf: async () => ({ success: true, data: { path: '' } }),
          getDatasetRefreshInfo: async () => ({ success: true, data: {} }),
          getDashboardDataFreshness: async () => ({ success: true, data: {} }),
          getAllItems: async () => ({ success: true, data: allItems }),
        },
        window: {
          minimize: async () => undefined,
          maximize: async () => undefined,
          close: async () => undefined,
          isMaximized: async () => false,
          setTitleBarOverlay: async () => undefined,
        },
        settings: {
          get: async () => ({ success: true, data: settings }),
          update: async (updates) => ({ success: true, data: { ...settings, ...updates } }),
          reset: async () => ({ success: true, data: settings }),
        },
        usage: {
          recordOpen: async () => ({ success: true, data: undefined }),
          getRecent: async () => ({ success: true, data: recent }),
          getFrequent: async () => ({ success: true, data: frequent }),
          clear: async () => ({ success: true, data: undefined }),
          remove: async () => ({ success: true, data: undefined }),
        },
        export: {
          choosePdfPath: async () => ({ success: true, data: { path: '' } }),
          currentViewToPdf: async () => ({ success: true, data: { path: '' } }),
        },
        app: {
          getAppWebviewConfig: async () => ({ partition: null, userAgent: 'Mozilla/5.0' }),
          getVersion: async () => '${version}',
          openUserGuide: async () => ({ success: true, data: undefined }),
        },
        log: {
          openFolder: async () => ({ success: true, data: undefined }),
        },
        kiosk: {
          preventDisplaySleep: async () => ({ success: true, data: true }),
          allowDisplaySleep: async () => ({ success: true, data: false }),
        },
      };

      // Also stub matchMedia so Fluent UI theme detection works
      if (!window.matchMedia || window.matchMedia.toString().includes('native code')) {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          configurable: true,
          value: (query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          }),
        });
      }
    })();
  `;
}


function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting vite dev server...');
    const proc = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write('[vite] ' + text);
      if (!resolved && text.includes('localhost:5173')) {
        resolved = true;
        setTimeout(() => resolve(proc), 1500);
      }
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write('[vite-err] ' + data.toString());
    });

    proc.on('error', reject);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(proc);
      }
    }, 30000);
  });
}


async function navigateTo(page, hash, waitMs = 1500) {
  await page.goto(BASE_URL + hash, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout: 10000 });
  await new Promise(r => setTimeout(r, waitMs));
}

async function screenshotFull(page, filename) {
  const outPath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('  Saved:', filename);
  return outPath;
}

async function screenshotElement(page, selector, filename, padding = 0) {
  const outPath = path.join(SCREENSHOTS_DIR, filename);
  await page.waitForSelector(selector, { timeout: 5000 });
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box for: ${selector}`);
  await page.screenshot({
    path: outPath,
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    },
  });
  console.log('  Saved:', filename);
  return outPath;
}


async function newMockedPage(browser, mockOpts) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(buildMockScript(mockOpts));
  return page;
}


const captured = [];
const failed = [];

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const devServer = await startDevServer();
  console.log('Dev server started. Launching browser...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    console.log('\n[1] Login screen...');
    try {
      const page = await newMockedPage(browser, { isAuthenticated: false });
      await navigateTo(page, '#/login', 2000);
      await screenshotFull(page, '01-login.png');
      captured.push('01-login.png');
      await page.close();
    } catch (e) { failed.push('01-login.png: ' + e.message); }

    console.log('\n[2] Login error state...');
    try {
      const page = await newMockedPage(browser, { isAuthenticated: false });
      await navigateTo(page, '#/login', 2000);
      await page.evaluate(() => {
        const root = document.querySelector('#root');
        if (!root) return;
        window.electronAPI.auth.login = async () => ({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Could not complete the sign-in process.',
            userMessage: 'Could not complete the sign-in process.',
          },
        });
      });
      await page.click('button[class*="fui-Button"]');
      await new Promise(r => setTimeout(r, 1500));
      await screenshotFull(page, '02-login-error.png');
      captured.push('02-login-error.png');
      await page.close();
    } catch (e) { failed.push('02-login-error.png: ' + e.message); }

    console.log('\n[3] Home populated...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        reports: SAMPLE_REPORTS,
        dashboards: SAMPLE_DASHBOARDS,
        recent: SAMPLE_RECENT,
        frequent: SAMPLE_FREQUENT,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2500);
      await screenshotFull(page, '03-home-populated.png');
      captured.push('03-home-populated.png');
      await page.close();
    } catch (e) { failed.push('03-home-populated.png: ' + e.message); }

    console.log('\n[4] Home empty state...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: [],
        reports: [],
        dashboards: [],
        recent: [],
        frequent: [],
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2500);
      await screenshotFull(page, '04-home-empty.png');
      captured.push('04-home-empty.png');
      await page.close();
    } catch (e) { failed.push('04-home-empty.png: ' + e.message); }

    console.log('\n[5] Title bar close-up...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05-titlebar.png'),
        clip: { x: 0, y: 0, width: 1280, height: 48 },
      });
      console.log('  Saved: 05-titlebar.png');
      captured.push('05-titlebar.png');

      try {
        const avatarBtn = await page.$('[aria-haspopup="menu"]');
        if (avatarBtn) {
          await avatarBtn.click();
          await new Promise(r => setTimeout(r, 800));
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '05b-titlebar-menu.png'),
            clip: { x: 0, y: 0, width: 1280, height: 200 },
          });
          console.log('  Saved: 05b-titlebar-menu.png');
          captured.push('05b-titlebar-menu.png');
        }
      } catch (e2) { failed.push('05b-titlebar-menu.png: ' + e2.message); }
      await page.close();
    } catch (e) { failed.push('05-titlebar.png: ' + e.message); }

    console.log('\n[6] Sidebar expanded...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '06-sidebar-expanded.png'),
        clip: { x: 0, y: 40, width: 260, height: 760 },
      });
      console.log('  Saved: 06-sidebar-expanded.png');
      captured.push('06-sidebar-expanded.png');
      await page.close();
    } catch (e) { failed.push('06-sidebar-expanded.png: ' + e.message); }

    console.log('\n[7] Sidebar collapsed...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: true },
      });
      await navigateTo(page, '#/', 2000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07-sidebar-collapsed.png'),
        clip: { x: 0, y: 40, width: 80, height: 760 },
      });
      console.log('  Saved: 07-sidebar-collapsed.png');
      captured.push('07-sidebar-collapsed.png');
      await page.close();
    } catch (e) { failed.push('07-sidebar-collapsed.png: ' + e.message); }

    console.log('\n[8] Search dialog...');
    try {
      const searchResults = [
        { id: 'rpt-001', name: 'Q4 Sales Performance', type: 'report', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing' },
        { id: 'dash-001', name: 'Executive Summary', type: 'dashboard', workspaceId: 'ws-001', workspaceName: 'Sales & Marketing' },
        { id: 'app-001', name: 'Sales Analytics Suite', type: 'app' },
        { id: 'ws-001', name: 'Sales & Marketing', type: 'workspace' },
      ];
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        reports: SAMPLE_REPORTS,
        dashboards: SAMPLE_DASHBOARDS,
        apps: SAMPLE_APPS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
        getAllItemsData: {
          workspaces: SAMPLE_WORKSPACES,
          reports: SAMPLE_REPORTS,
          dashboards: SAMPLE_DASHBOARDS,
          partialFailure: false,
          failedWorkspaces: [],
        },
      });
      await navigateTo(page, '#/', 2000);
      await page.keyboard.down('Control');
      await page.keyboard.press('k');
      await page.keyboard.up('Control');
      await new Promise(r => setTimeout(r, 800));
      await page.keyboard.type('sales');
      await new Promise(r => setTimeout(r, 1500));
      await screenshotFull(page, '08-search-dialog.png');
      captured.push('08-search-dialog.png');
      await page.close();
    } catch (e) { failed.push('08-search-dialog.png: ' + e.message); }

    console.log('\n[9] Workspaces page...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        reports: SAMPLE_REPORTS,
        dashboards: SAMPLE_DASHBOARDS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/workspaces', 2500);
      await screenshotFull(page, '09-workspaces-collapsed.png');
      captured.push('09-workspaces-collapsed.png');

      try {
        const expandBtns = await page.$$('[data-testid="workspace-expand"], button');
        const allBtns = await page.$$('button');
        for (const btn of allBtns) {
          const text = await btn.evaluate(el => el.textContent);
          if (text && text.includes('Sales & Marketing')) {
            await btn.click();
            await new Promise(r => setTimeout(r, 1000));
            break;
          }
        }
        await screenshotFull(page, '09b-workspaces-expanded.png');
        captured.push('09b-workspaces-expanded.png');
      } catch (e2) { failed.push('09b-workspaces-expanded.png: ' + e2.message); }

      await page.close();
    } catch (e) { failed.push('09-workspaces-collapsed.png: ' + e.message); }

    console.log('\n[10] Apps page...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        apps: SAMPLE_APPS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/apps', 2500);
      await screenshotFull(page, '10-apps-page.png');
      captured.push('10-apps-page.png');
      await page.close();
    } catch (e) { failed.push('10-apps-page.png: ' + e.message); }

    console.log('\n[11] Report viewer toolbar...');
    try {
      const freshTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        reports: SAMPLE_REPORTS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await page.evaluateOnNewDocument(`
        const _orig = window.electronAPI;
        // This runs before our main mock — defer to after page load
      `);
      await navigateTo(page, '#/report/ws-001/rpt-001', 3000);
      await page.evaluate((freshTime) => {
        window.electronAPI.content.getDatasetRefreshInfo = async () => ({
          success: true,
          data: { lastRefreshTime: freshTime, lastRefreshStatus: 'Completed' },
        });
      }, freshTime);

      await new Promise(r => setTimeout(r, 500));

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '11-report-toolbar-fresh.png'),
        clip: { x: 0, y: 40, width: 1280, height: 50 },
      });
      console.log('  Saved: 11-report-toolbar-fresh.png');
      captured.push('11-report-toolbar-fresh.png');
      await page.close();
    } catch (e) { failed.push('11-report-toolbar-fresh.png: ' + e.message); }

    console.log('\n[12] Report viewer toolbar stale...');
    try {
      const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        reports: SAMPLE_REPORTS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/report/ws-001/rpt-001', 3000);
      await page.evaluate((staleTime) => {
        window.electronAPI.content.getDatasetRefreshInfo = async () => ({
          success: true,
          data: { lastRefreshTime: staleTime, lastRefreshStatus: 'Completed' },
        });
      }, staleTime);
      await new Promise(r => setTimeout(r, 500));

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '12-report-toolbar-stale.png'),
        clip: { x: 0, y: 40, width: 1280, height: 50 },
      });
      console.log('  Saved: 12-report-toolbar-stale.png');
      captured.push('12-report-toolbar-stale.png');
      await page.close();
    } catch (e) { failed.push('12-report-toolbar-stale.png: ' + e.message); }

    console.log('\n[13] Settings page...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, theme: 'dark', sidebarCollapsed: false },
        recent: SAMPLE_RECENT,
        frequent: SAMPLE_FREQUENT,
      });
      await navigateTo(page, '#/settings', 2500);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '13-settings-full.png'),
        fullPage: true,
      });
      console.log('  Saved: 13-settings-full.png');
      captured.push('13-settings-full.png');

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '13a-settings-top.png'),
        clip: { x: 0, y: 0, width: 1280, height: 800 },
      });
      console.log('  Saved: 13a-settings-top.png');
      captured.push('13a-settings-top.png');

      await page.evaluate(() => window.scrollTo(0, 800));
      await new Promise(r => setTimeout(r, 300));
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '13b-settings-bottom.png'),
        clip: { x: 0, y: 0, width: 1280, height: 800 },
      });
      console.log('  Saved: 13b-settings-bottom.png');
      captured.push('13b-settings-bottom.png');

      await page.close();
    } catch (e) { failed.push('13-settings-full.png: ' + e.message); }

    console.log('\n[14] Settings page light theme...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, theme: 'light', sidebarCollapsed: false },
        recent: SAMPLE_RECENT,
        frequent: SAMPLE_FREQUENT,
      });
      await navigateTo(page, '#/settings', 2500);
      await screenshotFull(page, '14-settings-light.png');
      captured.push('14-settings-light.png');
      await page.close();
    } catch (e) { failed.push('14-settings-light.png: ' + e.message); }

    console.log('\n[15] Sign-out confirm dialog...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2000);
      const avatarBtn = await page.$('[aria-haspopup="menu"]');
      if (avatarBtn) {
        await avatarBtn.click();
        await new Promise(r => setTimeout(r, 600));
        const menuItems = await page.$$('[role="menuitem"]');
        for (const item of menuItems) {
          const text = await item.evaluate(el => el.textContent);
          if (text && text.includes('Sign out')) {
            await item.click();
            break;
          }
        }
        await new Promise(r => setTimeout(r, 800));
        await screenshotFull(page, '15-signout-dialog.png');
        captured.push('15-signout-dialog.png');
      } else {
        failed.push('15-signout-dialog.png: avatar button not found');
      }
      await page.close();
    } catch (e) { failed.push('15-signout-dialog.png: ' + e.message); }

    console.log('\n[16] Home light theme...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        recent: SAMPLE_RECENT,
        frequent: SAMPLE_FREQUENT,
        settings: { ...DEFAULT_SETTINGS, theme: 'light', sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2500);
      await screenshotFull(page, '16-home-light.png');
      captured.push('16-home-light.png');
      await page.close();
    } catch (e) { failed.push('16-home-light.png: ' + e.message); }

    console.log('\n[16b] Home dark theme...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        recent: SAMPLE_RECENT,
        frequent: SAMPLE_FREQUENT,
        settings: { ...DEFAULT_SETTINGS, theme: 'dark', sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2500);
      await screenshotFull(page, '16b-home-dark.png');
      captured.push('16b-home-dark.png');
      await page.close();
    } catch (e) { failed.push('16b-home-dark.png: ' + e.message); }

    console.log('\n[17] Kiosk exit overlay...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/', 2000);
      await page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed; bottom: 24px; right: 24px; z-index: 9999;
          background: rgba(0,0,0,0.75); color: white;
          padding: 12px 18px; border-radius: 8px; font-size: 14px;
          font-family: system-ui, sans-serif; pointer-events: none;
        `;
        overlay.textContent = 'Press Esc to exit';
        document.body.appendChild(overlay);
      });
      await new Promise(r => setTimeout(r, 500));
      await screenshotFull(page, '17-kiosk-exit-overlay.png');
      captured.push('17-kiosk-exit-overlay.png');
      await page.close();
    } catch (e) { failed.push('17-kiosk-exit-overlay.png: ' + e.message); }

    console.log('\n[18] Dashboard viewer toolbar...');
    try {
      const page = await newMockedPage(browser, {
        isAuthenticated: true,
        user: SAMPLE_USER,
        workspaces: SAMPLE_WORKSPACES,
        dashboards: SAMPLE_DASHBOARDS,
        settings: { ...DEFAULT_SETTINGS, sidebarCollapsed: false },
      });
      await navigateTo(page, '#/dashboard/ws-001/dash-001', 3000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '18-dashboard-toolbar.png'),
        clip: { x: 0, y: 40, width: 1280, height: 50 },
      });
      console.log('  Saved: 18-dashboard-toolbar.png');
      captured.push('18-dashboard-toolbar.png');
      await page.close();
    } catch (e) { failed.push('18-dashboard-toolbar.png: ' + e.message); }

  } finally {
    if (browser) await browser.close();
    if (devServer) {
      devServer.kill('SIGTERM');
      console.log('\nDev server stopped.');
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('Captured:', captured.length);
  captured.forEach(f => console.log('  OK:', f));
  console.log('Failed:', failed.length);
  failed.forEach(f => console.log('  FAIL:', f));

  const summary = JSON.stringify({ captured, failed, dir: SCREENSHOTS_DIR }, null, 2);
  const { writeFile } = await import('fs/promises');
  await writeFile(path.join(SCREENSHOTS_DIR, '_summary.json'), summary);
  console.log('\nSummary saved to', path.join(SCREENSHOTS_DIR, '_summary.json'));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
