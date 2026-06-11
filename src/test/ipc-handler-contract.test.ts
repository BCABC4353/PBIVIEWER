
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc-channels';


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


const IPC_DIR = path.resolve(__dirname, '../main/ipc');

const handlerFiles = fs
  .readdirSync(IPC_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => path.join(IPC_DIR, f));

const mainIpcSource = handlerFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

const channelEntries = collectChannelEntries(IPC_CHANNELS);


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
