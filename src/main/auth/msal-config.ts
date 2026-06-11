import { Configuration, LogLevel } from '@azure/msal-node';
import log from 'electron-log/main';
import { AZURE_CONFIG } from './azure-config.generated';

const clientId = AZURE_CONFIG.clientId;
const tenantId = AZURE_CONFIG.tenantId;

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

export const adminScopes = ['https://analysis.windows.net/powerbi/api/Tenant.Read.All'];
