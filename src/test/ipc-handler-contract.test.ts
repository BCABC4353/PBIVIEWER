/**
 * NEW-CI-3: Main-process IPC handler contract test.
 *
 * Asserts that every channel string declared in IPC_CHANNELS has a corresponding
 * handler registered in the main-process IPC layer (src/main/ipc/*.ts), so a
 * channel added with a preload method + type but no ipcMain.handle/ipcMain.on
 * fails CI immediately rather than silently producing "No handler registered"
 * at runtime.
 *
 * Strategy:
 *   1. Build a flat map of channel wire-string → all textual references that
 *      could appear in handler source: the literal string itself (e.g.
 *      'auth:login') and the IPC_CHANNELS dot-path constant (e.g.
 *      'IPC_CHANNELS.auth.login'). The latter is needed because some handler
 *      files (kiosk.ts) reference channels via the constant rather than a
 *      bare string literal — both forms are valid, and both prove the handler
 *      exists.
 *   2. Read and concatenate the source text of every *.ts file in
 *      src/main/ipc/ (excluding *.test.ts files, which are not handler code).
 *   3. Assert that at least one textual form for each channel appears in the
 *      concatenated source, producing a clear per-channel failure message
 *      naming the offending channel when the contract is broken.
 *
 * This is a static-text check — no Electron runtime is needed, which keeps
 * the test runnable in jsdom/Node.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc-channels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a nested const object and collect every leaf string value
 * together with the dot-path of IPC_CHANNELS property names that leads to it.
 *
 * Example:
 *   { auth: { login: 'auth:login' } }
 *   → [{ wireString: 'auth:login', dotPath: 'IPC_CHANNELS.auth.login' }]
 */
function collectChannelEntries(
  obj: unknown,
  pathSegments: string[] = [],
): Array<{ wireString: string; dotPath: string }> {
  if (typeof obj === 'string') {
    return [
      {
        wireString: obj,
        dotPath: ['IPC_CHANNELS', ...pathSegments].join('.'),
      },
    ];
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
      collectChannelEntries(value, [...pathSegments, key]),
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const IPC_DIR = path.resolve(__dirname, '../main/ipc');

/** All *.ts handler files — exclude *.test.ts so test files don't self-satisfy. */
const handlerFiles = fs
  .readdirSync(IPC_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => path.join(IPC_DIR, f));

/** Concatenated source of every main-process IPC handler file. */
const mainIpcSource = handlerFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

/** Full entry list: wire-string + the dot-path constant reference. */
const channelEntries = collectChannelEntries(IPC_CHANNELS);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('main-process IPC handler contract', () => {
  it('src/main/ipc/ contains at least one handler file', () => {
    expect(handlerFiles.length).toBeGreaterThan(0);
  });

  it('concatenated main IPC source is non-empty', () => {
    expect(mainIpcSource.length).toBeGreaterThan(0);
  });

  it('IPC_CHANNELS contains at least one channel per namespace', () => {
    const namespaces = Object.keys(IPC_CHANNELS);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const ns of namespaces) {
      const entries = collectChannelEntries((IPC_CHANNELS as Record<string, unknown>)[ns]);
      expect(
        entries.length,
        `namespace "${ns}" should have at least one channel`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(channelEntries)(
    'main IPC source registers channel "$wireString"',
    ({ wireString, dotPath }) => {
      const hasLiteral = mainIpcSource.includes(wireString);
      const hasConstant = mainIpcSource.includes(dotPath);

      expect(
        hasLiteral || hasConstant,
        `Channel "${wireString}" from IPC_CHANNELS has no ipcMain.handle/ipcMain.on in src/main/ipc/*.ts.\n` +
          `Searched for literal "${wireString}" or constant "${dotPath}".\n` +
          'Add an ipcMain.handle (or ipcMain.on) for this channel, or remove it from ipc-channels.ts.',
      ).toBe(true);
    },
  );
});
