import { app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Security helpers

export function isValidExportPath(filePath: string): boolean {
  let resolved = path.resolve(filePath);
  try {
    // Resolve symlinks in the parent directory so a link inside Downloads
    // pointing elsewhere cannot smuggle the write outside the allowed roots.
    // The parent must exist (the save dialog guarantees it); the file itself
    // may not exist yet, but if it does it must not be a symlink.
    const realDir = fs.realpathSync(path.dirname(resolved));
    resolved = path.join(realDir, path.basename(resolved));
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
      return false;
    }
  } catch {
    return false;
  }
  // Homedir() is intentionally excluded — exports must target a specific
  // well-known directory, not the user profile root (which would be too broad).
  const downloads = app.getPath('downloads');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  // Canonicalize the roots the same way the candidate path was canonicalized
  // above. Without this, a root that sits behind a symlink (e.g. macOS's
  // /var -> /private/var tmpdir firmlink, or a user-relocated Downloads
  // folder) never prefix-matches the realpath'd candidate and valid exports
  // are wrongly rejected.
  const allowedRoots = [downloads, desktop, documents].map((root) => {
    try {
      return fs.realpathSync(root);
    } catch {
      return root; // root missing/unreadable — keep raw path; prefix check still applies
    }
  });
  return (
    allowedRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root) &&
    resolved.toLowerCase().endsWith('.pdf')
  );
}

const APP_CSP =
  "default-src 'self'; script-src 'self'; " +
  "frame-src https://app.powerbi.com https://login.microsoftonline.com; " +
  "connect-src https://api.powerbi.com https://login.microsoftonline.com; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "object-src 'none'; base-uri 'self'";

export function installCsp(sess: Electron.Session): void {
  sess.webRequest.onHeadersReceived((details, callback) => {
    // Enforce CSP ONLY on our own app document (file://). Never rewrite headers on
    // remote Power BI / AAD responses (different URLs), or the embeds break.
    if (details.url.startsWith('file://')) {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [APP_CSP] } });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
}

// Webview security — popups, preload, and navigation restrictions

// Power BI host allowlist — enforced on webview src and navigation.
const POWERBI_ALLOWED_HOSTS = [
  'app.powerbi.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.windows.net',
  'aadcdn.msftauth.net',
  'aadcdn.msauth.net',
  // Azure AD B2C / some federated sign-in flows redirect through these hosts;
  // without them a federated user's in-webview sign-in silently stalls on a
  // blocked navigation (endsWith match also covers *.b2clogin.com subdomains).
  'b2clogin.com',
];

export function isAllowedPowerBIHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return POWERBI_ALLOWED_HOSTS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// Handle all webContents creation (including webviews)
export function registerWebviewSecurity(): void {
  app.on('web-contents-created', (_, contents) => {
    // Wire the webview guard onto the embedder's WebContents.
    // 'will-attach-webview' is a WebContents event (not a Session event), so it
    // must be registered here on the contents object, not on session.
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      // Force-disable node integration and force-enable context isolation.
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      // Disallow renderer-injected preload scripts — only our controlled preload
      // (set at BrowserWindow creation) is permitted.
      delete webPreferences.preload;
      // Enforce the Power BI host allowlist on the webview src.
      // params.src is typed as string | undefined in Electron's d.ts.
      if (!params.src || !isAllowedPowerBIHost(params.src)) {
        event.preventDefault();
      }
    });

    // Only handle webviews, not the main window
    if (contents.getType() === 'webview') {
      // Handle new windows/popups - open in system browser with URL validation
      contents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            shell.openExternal(url);
          }
        } catch {
          // Invalid URL, ignore
        }
        return { action: 'deny' };
      });

      // Restrict webview navigation to allowed domains
      contents.on('will-navigate', (event, url) => {
        if (!isAllowedPowerBIHost(url)) {
          event.preventDefault();
        }
      });
    }
  });
}
