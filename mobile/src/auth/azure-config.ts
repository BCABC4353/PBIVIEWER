/**
 * Azure AD (Entra) app-registration constants for the mobile app.
 *
 * TWO sources, checked in order:
 *
 *  1. `azure-config.local.json` (this folder, GITIGNORED) — drop the desktop
 *     app's clientId/tenantId in as `{ "clientId": "…", "tenantId": "…" }`
 *     and live mode lights up with zero source edits. `npm start` creates an
 *     empty stub automatically (Metro needs the file to exist to bundle).
 *  2. The placeholders below — same as the desktop's bake-at-build flow
 *     (scripts/generate-config.js → azure-config.generated.ts); paste the
 *     SAME public-client registration's GUIDs here if you prefer baking them.
 *
 * Empty / non-GUID values are detected at runtime and the app stays in
 * sample-data mode with a clear message instead of a broken AAD page
 * (mirrors desktop's azureConfigValid guard against the blank-window
 * sign-in outage).
 */

// Metro provides CommonJS `require` at runtime; under plain Node ESM (vitest)
// the reference throws and the catch below falls back to the placeholders.
declare function require(id: string): unknown;

interface AzureConfigShape {
  clientId: string;
  tenantId: string;
}

/** Baked-in fallbacks (desktop-style). Leave empty to use the local file. */
const PLACEHOLDERS: AzureConfigShape = {
  clientId: '',
  tenantId: '',
};

function loadLocalOverride(): Partial<Record<keyof AzureConfigShape, unknown>> {
  try {
    // Static literal so Metro bundles the file; `npm start` guarantees it
    // exists (scripts/ensure-azure-config.mjs writes an empty stub).
    return require('./azure-config.local.json') as Partial<
      Record<keyof AzureConfigShape, unknown>
    >;
  } catch {
    return {};
  }
}

const local = loadLocalOverride();
const fromLocal = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const AZURE_CONFIG: AzureConfigShape = {
  clientId: fromLocal(local.clientId) || PLACEHOLDERS.clientId,
  tenantId: fromLocal(local.tenantId) || PLACEHOLDERS.tenantId,
};

/** Same GUID guard the desktop uses (msal-config.ts) — a build is only
 *  live-capable when both values are real GUIDs, not placeholders. */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const azureConfigValid: boolean =
  GUID_RE.test((AZURE_CONFIG.clientId ?? '').trim()) &&
  GUID_RE.test((AZURE_CONFIG.tenantId ?? '').trim());
