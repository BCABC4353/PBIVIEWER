import { app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';


export function isValidExportPath(filePath: string): boolean {
  let resolved = path.resolve(filePath);
  try {
    const realDir = fs.realpathSync(path.dirname(resolved));
    resolved = path.join(realDir, path.basename(resolved));
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
      return false;
    }
  } catch {
    return false;
  }
  const downloads = app.getPath('downloads');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  const allowedRoots = [downloads, desktop, documents].map((root) => {
    try {
      return fs.realpathSync(root);
    } catch {
      return root;
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
    if (details.url.startsWith('file://')) {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [APP_CSP] } });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
}


const POWERBI_ALLOWED_HOSTS = [
  'app.powerbi.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.windows.net',
  'aadcdn.msftauth.net',
  'aadcdn.msauth.net',
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

export function registerWebviewSecurity(): void {
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      delete webPreferences.preload;
      if (!params.src || !isAllowedPowerBIHost(params.src)) {
        event.preventDefault();
      }
    });

    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            shell.openExternal(url);
          }
        } catch {
        }
        return { action: 'deny' };
      });

      contents.on('will-navigate', (event, url) => {
        if (!isAllowedPowerBIHost(url)) {
          event.preventDefault();
        }
      });
    }
  });
}
