import { Configuration, LogLevel } from '@azure/msal-node';
import log from 'electron-log/main';
import { AZURE_CONFIG } from './azure-config.generated';

// Azure AD Configuration
// Credentials are embedded at build time via scripts/generate-config.js
const clientId = AZURE_CONFIG.clientId;
const tenantId = AZURE_CONFIG.tenantId;

/**
 * A build is only usable if both Azure credentials are real (GUID-shaped, not
 * the .env.example placeholders). When they are not, MSAL silently produces an
 * auth URL the AAD endpoint rejects — which surfaces to the user as a BLANK
 * Microsoft sign-in window with no explanation (the exact "credentials are
 * completely broken, can't even see the O365 login" outage). login() checks
 * this up front and shows a clear, actionable error instead of a blank window.
 */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const azureConfigValid: boolean =
  GUID_RE.test((clientId ?? '').trim()) && GUID_RE.test((tenantId ?? '').trim());

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            log.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            log.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            log.info('[MSAL]', message);
            break;
          case LogLevel.Verbose:
            log.debug('[MSAL]', message);
            break;
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: [
    'https://analysis.windows.net/powerbi/api/Report.Read.All',
    'https://analysis.windows.net/powerbi/api/Dashboard.Read.All',
    'https://analysis.windows.net/powerbi/api/Workspace.Read.All',
    'https://analysis.windows.net/powerbi/api/App.Read.All',
    'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
    // Data-freshness feature: read dataflow refresh transactions so the viewer can
    // show the upstream dataflow's last SUCCESSFUL completion (a dataset can report
    // success while serving stale data). NOTE: adding this scope requires a one-time
    // admin re-consent in Entra, and each user re-signs-in once.
    'https://analysis.windows.net/powerbi/api/Dataflow.Read.All',
    'offline_access',
    'openid',
    'profile',
    'email',
  ],
};

export const silentRequest = {
  scopes: loginRequest.scopes,
};
