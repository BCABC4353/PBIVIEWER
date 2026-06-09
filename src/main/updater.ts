import { app, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';

const GITHUB_REPO = 'BCABC4353/PBIVIEWER';

/**
 * Compare "major.minor.patch" version strings; true if `a` is newer than `b`.
 * Tolerates a leading "v" and any "-prerelease" suffix. Avoids a semver dep.
 */
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
  return false;
}

/**
 * macOS update path. Squirrel.Mac cannot auto-update an unsigned / ad-hoc app
 * (it requires a Developer ID signature on both the running app and the update),
 * so we only CHECK GitHub for a newer release and offer to open the download
 * page. This never writes to the app bundle, so it can never brick the install.
 * Fail-silent on any error (offline, proxy, rate limit) — never block launch.
 */
async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PBIVIEWER-updater' },
    });
    if (!res.ok) return;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!rel.tag_name || !isNewerVersion(rel.tag_name, app.getVersion())) return;
    const choice = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `A newer version of Power BI Viewer is available (${rel.tag_name.replace(/^v/i, '')}).`,
      detail: `You have ${app.getVersion()}. Click Download, then replace the app in Applications to update.`,
    });
    if (choice.response === 0 && rel.html_url) {
      await shell.openExternal(rel.html_url);
    }
  } catch (err) {
    log.warn('[updater] update-notify check failed (non-fatal):', err);
  }
}

/**
 * Wire app updating.
 * - Windows: real silent auto-update via electron-updater — downloads in the
 *   background and installs on the NEXT quit (autoInstallOnAppQuit). The download
 *   is isolated to a temp dir and never touches the running version, so a failed
 *   update just leaves the user on the current working build.
 * - macOS / other: notify-only (Squirrel.Mac can't update an unsigned app).
 * Only runs in a packaged build. Every failure is swallowed so updating can
 * never crash the app or block startup.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  if (process.platform === 'win32') {
    try {
      autoUpdater.logger = log;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true; // silent install on next restart
      autoUpdater.allowDowngrade = false;
      autoUpdater.allowPrerelease = false;
      // A failed update must NEVER crash the app. Swallow every error.
      autoUpdater.on('error', (err) =>
        log.warn('[updater] error (staying on current version):', err),
      );
      const check = () =>
        autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] check failed:', err));
      void check();
      // Re-check every 6h for users who leave the app open for days (wall displays).
      setInterval(check, 6 * 60 * 60 * 1000);
    } catch (err) {
      log.warn('[updater] setup failed (non-fatal):', err);
    }
  } else {
    void notifyIfUpdateAvailable();
  }
}
