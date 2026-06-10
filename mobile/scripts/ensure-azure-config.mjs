/**
 * ensure-azure-config — writes an empty src/auth/azure-config.local.json stub
 * when missing. Metro resolves the require('./azure-config.local.json') in
 * azure-config.ts statically, so the (gitignored) file must EXIST for the
 * bundle to build; empty values simply leave the app in sample-data mode.
 * Wired as `prestart` so `npm start` always passes through here.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../src/auth/azure-config.local.json', import.meta.url));

if (!existsSync(target)) {
  writeFileSync(target, JSON.stringify({ clientId: '', tenantId: '' }, null, 2) + '\n');
  console.log(
    '[azure-config] created src/auth/azure-config.local.json (empty stub — sample-data mode).\n' +
      '[azure-config] For live mode, paste the desktop app registration GUIDs into it:\n' +
      '[azure-config]   { "clientId": "<app GUID>", "tenantId": "<tenant GUID>" }',
  );
}
