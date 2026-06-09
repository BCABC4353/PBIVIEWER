import { Configuration, LogLevel } from '@azure/msal-node';
import log from 'electron-log/main';
import { AZURE_CONFIG } from './azure-config.generated';

// Azure AD Configuration
// Credentials are embedded at build time via scripts/generate-config.js
const clientId = AZURE_CONFIG.clientId;
const tenantId = AZURE_CONFIG.tenantId;

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
