
declare function require(id: string): unknown;

interface AzureConfigShape {
  clientId: string;
  tenantId: string;
}

const PLACEHOLDERS: AzureConfigShape = {
  clientId: '',
  tenantId: '',
};

function loadLocalOverride(): Partial<Record<keyof AzureConfigShape, unknown>> {
  try {
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

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const azureConfigValid: boolean =
  GUID_RE.test((AZURE_CONFIG.clientId ?? '').trim()) &&
  GUID_RE.test((AZURE_CONFIG.tenantId ?? '').trim());
