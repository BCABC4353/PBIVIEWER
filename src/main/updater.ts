import { app, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';

const GITHUB_REPO = 'BCABC4353/PBIVIEWER';
const FORCE_POLICY_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/update-policy.json`;

const ROUTINE_CHECK_MS = 2 * 60 * 60 * 1000;
const FORCE_POLL_MS = 10 * 60 * 1000;
const FORCE_GRACE_MS = 30 * 1000;

let forceImmediate = false;
let updateDownloaded = false;
let installing = false;

function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string): number[] => {
    const core = v.replace(/^v/i, '').split('-')[0] ?? '';
    return core.split('.').map((n) => parseInt(n, 10) || 0);
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  const preA = a.replace(/^v/i, '').includes('-');
  const preB = b.replace(/^v/i, '').includes('-');
  return !preA && preB;
}

async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PBIVIEWER-updater' },
    });
    if (!res.ok) return;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!rel.tag_name || rel.tag_name.includes('-') || !isNewerVersion(rel.tag_name, app.getVersion()))
      return;
    const choice = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `A newer version of Power BI Viewer is available (${rel.tag_name.replace(/^v/i, '')}).`,
      detail: `You have ${app.getVersion()}. Click Download, then replace the app in Applications to update.`,
    });
    if (choice.response === 0 && rel.html_url) {
      try {
        const u = new URL(rel.html_url);
        if (u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.github.com'))) {
          await shell.openExternal(rel.html_url);
        }
      } catch {
      }
    }
  } catch (err) {
    log.warn('[updater] update-notify check failed (non-fatal):', err);
  }
}

async function isForcedBehind(): Promise<boolean> {
  try {
    const res = await fetch(FORCE_POLICY_URL, { headers: { 'User-Agent': 'PBIVIEWER-updater' } });
    if (!res.ok) return false;
    const policy = (await res.json()) as { forceMinVersion?: string };
    const min = policy.forceMinVersion;
    return Boolean(min && !min.includes('-') && isNewerVersion(min, app.getVersion()));
  } catch {
    return false;
  }
}

function forceInstallNow(): void {
  if (installing) return;
  installing = true;
  log.info('[updater] forced update ready — restarting to apply.');
  let restarted = false;
  const restart = () => {
    if (restarted) return;
    restarted = true;
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      log.warn('[updater] quitAndInstall failed — will retry on the next check:', err);
      installing = false;
      restarted = false;
    }
  };
  void dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['Restart now'],
      defaultId: 0,
      message: 'A required update is ready.',
      detail: 'Power BI Viewer will restart shortly to apply an important update.',
    })
    .then(restart);
  setTimeout(restart, FORCE_GRACE_MS);
}

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  if (process.platform !== 'win32') {
    void notifyIfUpdateAvailable();
    return;
  }

  try {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('error', (err) =>
      log.warn('[updater] error (staying on current version):', err),
    );
    autoUpdater.on('update-downloaded', () => {
      updateDownloaded = true;
      if (forceImmediate) forceInstallNow();
    });

    let checkInFlight = false;
    const routineCheck = async () => {
      if (checkInFlight) return;
      checkInFlight = true;
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        log.warn('[updater] check failed:', err);
      } finally {
        checkInFlight = false;
      }
    };

    const forceCheck = async () => {
      if (forceImmediate) {
        if (updateDownloaded && !installing) forceInstallNow();
        return;
      }
      if (await isForcedBehind()) {
        forceImmediate = true;
        if (updateDownloaded) forceInstallNow();
        else routineCheck();
      }
    };

    void routineCheck();
    void forceCheck();
    setInterval(routineCheck, ROUTINE_CHECK_MS);
    setInterval(() => void forceCheck(), FORCE_POLL_MS);
  } catch (err) {
    log.warn('[updater] setup failed (non-fatal):', err);
  }
}
