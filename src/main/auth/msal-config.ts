import { Configuration, LogLevel } from '@azure/msal-node';

// Azure AD Configuration
// These are public application identifiers for delegated (user) authentication
// Security is enforced by user login, not by keeping these secret
const clientId = process.env.AZURE_CLIENT_ID || 'ee7edf76-d666-4e27-8ee7-fbc19648c4f4';
const tenantId = process.env.AZURE_TENANT_ID || '65028f2d-9190-4d7f-bc2d-8ce298c3ba6f';

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
