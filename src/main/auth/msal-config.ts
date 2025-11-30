import { Configuration, LogLevel } from '@azure/msal-node';

// Azure AD Configuration
// These must be set via environment variables (.env file or system env)
// Never commit actual credentials to source control
const clientId = process.env.AZURE_CLIENT_ID;
const tenantId = process.env.AZURE_TENANT_ID;

if (!clientId || !tenantId) {
  throw new Error(
    'Missing required Azure AD configuration. ' +
    'Please set AZURE_CLIENT_ID and AZURE_TENANT_ID environment variables. ' +
    'See .env.example for details.'
  );
}

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
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            console.info('[MSAL]', message);
            break;
          case LogLevel.Verbose:
            console.debug('[MSAL]', message);
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
    'offline_access',
    'openid',
    'profile',
    'email',
  ],
};

export const silentRequest = {
  scopes: loginRequest.scopes,
};
