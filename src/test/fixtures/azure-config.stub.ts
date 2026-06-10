// Test stand-in for src/main/auth/azure-config.generated.ts, which is produced
// by scripts/generate-config.js at build time and is gitignored. Without this
// alias target the entire auth-service test suite fails to load on a fresh
// clone (vitest.config.ts maps the generated path here).
export const AZURE_CONFIG = {
  clientId: '00000000-0000-0000-0000-000000000000',
  tenantId: '11111111-1111-1111-1111-111111111111',
} as const;
