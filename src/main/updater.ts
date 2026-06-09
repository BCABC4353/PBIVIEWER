import { app, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';

const GITHUB_REPO = 'BCABC4353/PBIVIEWER';
// Tiny "force" policy file in the repo. Set forceMinVersion to a just-published
// version to make all running Windows apps below it update + restart NOW (within
// ~10-15 min) instead of waiting for the user's next restart. See docs/UPDATING.md.
const FORCE_POLICY_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/update-policy.json`;

// Routine auto-update check cadence (non-urgent updates install on next quit).
const ROUTINE_CHECK_MS = 2 * 60 * 60 * 1000; // 2h
// Force-policy poll cadence — a cheap raw-file fetch; drives "fix it NOW" updates.
const FORCE_POLL_MS = 10 * 60 * 1000; // 10 min
// Grace before an unattended (e.g. wall-display) forced restart fires anyway.
const FORCE_GRACE_MS = 30 * 1000;

let forceImmediate = false;
let updateDownloaded = false;
let installing = false;

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
  // Cores equal: standard semver ranks a prerelease BELOW its release
  // (2.2.0-beta < 2.2.0). So `a` is newer only if it is a stable release while
  // `b` is a prerelease of the same core.
  const preA = a.replace(/^v/i, '').includes('-');
  const preB = b.replace(/^v/i, '').includes('-');
  return !preA && preB;
}

/**
 * macOS update path. Squirrel.Mac cannot auto-update an unsigned / ad-hoc app
 * (it requires a Developer ID signature on both the running app and the update),
 * so we only CHECK GitHub for a newer release and offer to open the download
 * page. This never writes to the app bundle, so it can never brick the install.
 * Forcing is not possible on macOS — it's a manual install — so this is
 * notify-only. Fail-silent on any error; never block launch.
 */
async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PBIVIEWER-updater' },
    });
    if (!res.ok) return;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string };
    // Skip prerelease/beta tags outright — a 20-user production fleet should
    // never be nagged onto a beta even if one is accidentally published.
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
      // Validate the API-supplied URL before handing it to the OS (mirror the
      // app's other openExternal call sites): https + a github.com host only.
      try {
        const u = new URL(rel.html_url);
        if (u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.github.com'))) {
          await shell.openExternal(rel.html_url);
        }
      } catch {
        /* malformed URL in the release payload — ignore */
      }
    }
  } catch (err) {
    log.warn('[updater] update-notify check failed (non-fatal):', err);
  }
}

/** True if the repo's force-policy marks our current version as below the forced minimum. */
async function isForcedBehind(): Promise<boolean> {
  try {
    const res = await fetch(FORCE_POLICY_URL, { headers: { 'User-Agent': 'PBIVIEWER-updater' } });
    if (!res.ok) return false;
    const policy = (await res.json()) as { forceMinVersion?: string };
    const min = policy.forceMinVersion;
    // Ignore a prerelease target — never force the whole fleet onto a beta.
    return Boolean(min && !min.includes('-') && isNewerVersion(min, app.getVersion()));
  } catch {
    return false; // fail-silent: no policy => no force (gentle default)
  }
}

/** A forced (mandatory) update is downloaded — warn briefly, then restart into it. */
function forceInstallNow(): void {
  if (installing) return;
  installing = true;
  log.info('[updater] forced update ready — restarting to apply.');
  let restarted = false;
  const restart = () => {
    if (restarted) return; // one-shot: the dialog click AND the grace timer both call this
    restarted = true;
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      // The restart did not take (e.g. the staged installer was evicted, or a
      // quit handler blocked it). Un-latch so a later force poll can retry rather
      // than wedging this machine on the old version forever.
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
  // Restart regardless after a short grace (covers unattended wall displays).
  setTimeout(restart, FORCE_GRACE_MS);
}

/**
 * Wire app updating.
 * - Windows: electron-updater. Routine updates download in the background and
 *   install silently on the NEXT quit (autoInstallOnAppQuit). A repo-side
 *   "force" policy (update-policy.json) can mark an update mandatory, which pulls
 *   it and restarts NOW (~10-15 min) instead of waiting for a restart.
 * - macOS / other: notify-only (Squirrel.Mac can't update an unsigned app).
 * Only runs in a packaged build. Every failure is swallowed so updating can
 * never crash the app or block startup. The download is isolated to a temp dir
 * and never touches the running version, so a failed update is harmless.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  if (process.platform !== 'win32') {
    void notifyIfUpdateAvailable();
    return;
  }

  try {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true; // gentle default: install on next restart
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('error', (err) =>
      log.warn('[updater] error (staying on current version):', err),
    );
    autoUpdater.on('update-downloaded', () => {
      updateDownloaded = true;
      // Mandatory update -> apply immediately; otherwise wait for the gentle
      // autoInstallOnAppQuit path (next restart).
      if (forceImmediate) forceInstallNow();
    });

    const routineCheck = () =>
      autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] check failed:', err));

    // Force lever: poll the tiny policy file. If we're below its forceMinVersion,
    // this update is mandatory -> pull + apply it now rather than on next restart.
    const forceCheck = async () => {
      if (forceImmediate) {
        // Already armed. If the update is downloaded but a prior restart attempt
        // failed (installing was un-latched), retry applying it on this tick.
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
