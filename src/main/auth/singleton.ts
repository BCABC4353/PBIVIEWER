
import type { AuthService } from './auth-service';
import type { PowerBIApiService } from '../services/powerbi-api';

let authInstance: AuthService | null = null;
let powerbiInstance: PowerBIApiService | null = null;

export function getAuthService(): AuthService {
  if (authInstance === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAuthService, buildProductionDeps } = require('./auth-service') as typeof import('./auth-service');
    authInstance = createAuthService(buildProductionDeps());
  }
  return authInstance;
}

export function getPowerBIApiService(): PowerBIApiService {
  if (powerbiInstance === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPowerBIApiService, buildProductionApiDeps } = require('../services/powerbi-api') as typeof import('../services/powerbi-api');
    powerbiInstance = createPowerBIApiService(buildProductionApiDeps());
  }
  return powerbiInstance;
}

export function __setAuthServiceForTests(instance: AuthService | null): void {
  authInstance = instance;
}

export function __setPowerBIApiServiceForTests(instance: PowerBIApiService | null): void {
  powerbiInstance = instance;
}
