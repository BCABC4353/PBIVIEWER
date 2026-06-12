import { AZURE_CONFIG } from './azure-config';
import {
  pollDeviceCode,
  requestDeviceCode,
  type DeviceCodeConfig,
  type DeviceCodeDeps,
  type DeviceCodeFetch,
} from './device-code-auth';
import { DeviceCodeController } from './device-code-controller';
import { adoptTokenSet, SCOPES } from './msal-auth';
import { setSavedMode } from '../core/data-source-factory';

const config: DeviceCodeConfig = {
  clientId: AZURE_CONFIG.clientId,
  tenantId: AZURE_CONFIG.tenantId,
  scopes: SCOPES,
};

const deps: DeviceCodeDeps = { fetch: fetch as unknown as DeviceCodeFetch };

export const deviceCodeController = new DeviceCodeController({
  requestCode: () => requestDeviceCode(config, deps),
  poll: (challenge, hooks) => pollDeviceCode(config, challenge, deps, hooks),
  adoptTokens: adoptTokenSet,
  persistLiveMode: () => setSavedMode('live'),
});
