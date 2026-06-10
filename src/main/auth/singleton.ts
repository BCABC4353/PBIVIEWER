// Lazy production singleton accessors for the DI'd services.
//
// auth-service.ts and powerbi-api.ts expose `createX(deps)` factories. In
// production we still want a single shared instance, but we must NOT construct
// it at import time — doing so reaches for electron + MSAL, which crashes under
// the jsdom test environment.
//
// These accessors build the real instance on first use and memoize it. The
// `authService` / `powerbiApiService` proxies exported from the service modules
// delegate here, so existing `import { authService }` call sites are unchanged.
//
// NOTE: this module is imported by auth-service.ts and powerbi-api.ts, and it
// imports their factories back — a deliberate, harmless cycle because every
// reference is inside a function body (evaluated lazily), never at module top.

import type { AuthService } from './auth-service';
import type { PowerBIApiService } from '../services/powerbi-api';

let authInstance: AuthService | null = null;
let powerbiInstance: PowerBIApiService | null = null;

/** Get (or lazily build) the shared production AuthService. */
export function getAuthService(): AuthService {
  if (authInstance === null) {
    // Lazy require breaks the import cycle and defers electron/MSAL construction.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAuthService, buildProductionDeps } = require('./auth-service') as typeof import('./auth-service');
    authInstance = createAuthService(buildProductionDeps());
  }
  return authInstance;
}

/** Get (or lazily build) the shared production PowerBIApiService. */
export function getPowerBIApiService(): PowerBIApiService {
  if (powerbiInstance === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPowerBIApiService, buildProductionApiDeps } = require('../services/powerbi-api') as typeof import('../services/powerbi-api');
    powerbiInstance = createPowerBIApiService(buildProductionApiDeps());
  }
  return powerbiInstance;
}

/**
 * Test-only: replace the cached singletons (or reset to null). Lets unit tests
 * swap in a DI'd fake without re-importing the module graph. Never called in
 * production.
 */
export function __setAuthServiceForTests(instance: AuthService | null): void {
  authInstance = instance;
}

export function __setPowerBIApiServiceForTests(instance: PowerBIApiService | null): void {
  powerbiInstance = instance;
}
