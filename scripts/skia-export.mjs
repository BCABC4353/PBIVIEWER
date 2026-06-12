import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const originalMain = pkg.main;

try {
  pkg.main = 'index.skia.ts';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[skia-export] Swapped entry to index.skia.ts');

  execSync(
    'npx expo export --platform web --output-dir night-out\\skia-export3',
    { cwd: root, stdio: 'inherit' },
  );

  console.log('[skia-export] Export complete');
} finally {
  pkg.main = originalMain;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[skia-export] Restored entry to', originalMain);
}
