/**
 * Azure AD (Entra) app-registration constants for the mobile app.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  PLACEHOLDER VALUES — LIVE MODE IS UNAVAILABLE UNTIL FILLED IN.   ║
 * ║                                                                       ║
 * ║  The DESKTOP repo bakes these at build time via                       ║
 * ║  scripts/generate-config.js → src/main/auth/azure-config.generated.ts ║
 * ║  The owner pastes the SAME clientId/tenantId here (same public-client ║
 * ║  app registration; mobile only adds a new platform redirect URI in    ║
 * ║  Entra — it does NOT need a separate registration).                   ║
 * ║                                                                       ║
 * ║  Empty / non-GUID values are detected at runtime and the app stays in ║
 * ║  sample-data mode with a clear message instead of a broken AAD page   ║
 * ║  (mirrors desktop's azureConfigValid guard against the blank-window   ║
 * ║  sign-in outage).                                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */
export const AZURE_CONFIG = {
  clientId: '',
  tenantId: '',
} as const;

/** Same GUID guard the desktop uses (msal-config.ts) — a build is only
 *  live-capable when both values are real GUIDs, not placeholders. */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const azureConfigValid: boolean =
  GUID_RE.test((AZURE_CONFIG.clientId ?? '').trim()) &&
  GUID_RE.test((AZURE_CONFIG.tenantId ?? '').trim());
