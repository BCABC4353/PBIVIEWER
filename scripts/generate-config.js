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

const configContent = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at build time with Azure AD credentials
// This file is gitignored and should never be committed

export const AZURE_CONFIG = {
  clientId: '${clientId}',
  tenantId: '${tenantId}',
} as const;
`;

const outputPath = path.join(__dirname, '..', 'src', 'main', 'auth', 'azure-config.generated.ts');

fs.writeFileSync(outputPath, configContent);
console.log('Generated Azure config at:', outputPath);
