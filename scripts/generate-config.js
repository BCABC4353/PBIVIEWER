/**
 * Build-time configuration generator
 * This script generates a config file with Azure AD credentials embedded
 * Run this during the build process to bake credentials into the app
 */

const fs = require('fs');
const path = require('path');

// Try to load from environment variables first, then fall back to .env file
let clientId = process.env.AZURE_CLIENT_ID;
let tenantId = process.env.AZURE_TENANT_ID;

// If not in environment, try to read from .env file
if (!clientId || !tenantId) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('AZURE_CLIENT_ID=')) {
        clientId = trimmed.substring('AZURE_CLIENT_ID='.length);
      } else if (trimmed.startsWith('AZURE_TENANT_ID=')) {
        tenantId = trimmed.substring('AZURE_TENANT_ID='.length);
      }
    }
  }
}

if (!clientId || !tenantId) {
  console.error('ERROR: Missing required Azure AD configuration:');
  if (!clientId) console.error('  - AZURE_CLIENT_ID');
  if (!tenantId) console.error('  - AZURE_TENANT_ID');
  console.error('\nProvide via environment variables or .env file.');
  process.exit(1);
}

// Normalize: env-var values (CI secrets) may carry stray surrounding whitespace
// or a trailing newline that would corrupt the embedded GUID.
clientId = clientId.trim();
tenantId = tenantId.trim();

// Fail the build if the credentials aren't real GUIDs (e.g. the .env.example
// placeholders). Shipping a placeholder produces an installer whose Microsoft
// sign-in window comes up BLANK with no error — the worst failure for end users.
// Catch it here, where the operator building the release actually sees it.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = [];
if (!GUID_RE.test(clientId)) bad.push(`AZURE_CLIENT_ID (got "${clientId}")`);
if (!GUID_RE.test(tenantId)) bad.push(`AZURE_TENANT_ID (got "${tenantId}")`);
if (bad.length > 0) {
  console.error('ERROR: Azure AD configuration is not a valid GUID:');
  for (const b of bad) console.error(`  - ${b}`);
  console.error('\nThese must be the real Application (client) ID and Directory (tenant) ID');
  console.error('from the Entra app registration. A placeholder ships a broken sign-in.');
  process.exit(1);
}

const configContent = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at build time with Azure AD credentials
// This file is gitignored and should never be committed

export const AZURE_CONFIG = {
  clientId: ${JSON.stringify(clientId)},
  tenantId: ${JSON.stringify(tenantId)},
} as const;
`;

const outputPath = path.join(__dirname, '..', 'src', 'main', 'auth', 'azure-config.generated.ts');

fs.writeFileSync(outputPath, configContent);
console.log('Generated Azure config at:', outputPath);
