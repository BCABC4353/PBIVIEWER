
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc-channels';


function collectChannels(obj: unknown): string[] {
  if (typeof obj === 'string') return [obj];
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj as Record<string, unknown>).flatMap(collectChannels);
  }
  return [];
}


const PRELOAD_PATH = path.resolve(__dirname, '../preload/index.ts');
const preloadSource = fs.readFileSync(PRELOAD_PATH, 'utf-8');

const allChannels = collectChannels(IPC_CHANNELS);


describe('preload contextBridge channel-map contract', () => {
  it('src/preload/index.ts exists and is non-empty', () => {
    expect(preloadSource.length).toBeGreaterThan(0);
  });

  it('preload exposes contextBridge.exposeInMainWorld("electronAPI", ...)', () => {
    expect(preloadSource).toContain('contextBridge.exposeInMainWorld');
    expect(preloadSource).toContain('electronAPI');
  });

  it('IPC_CHANNELS contains at least one channel per namespace', () => {
    const namespaces = Object.keys(IPC_CHANNELS);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const ns of namespaces) {
      const nsChannels = collectChannels((IPC_CHANNELS as Record<string, unknown>)[ns]);
      expect(nsChannels.length, `namespace "${ns}" should have at least one channel`).toBeGreaterThan(0);
    }
  });

  it.each(allChannels)(
    'preload references channel "%s"',
    (channel) => {
      expect(
        preloadSource,
        `Channel "${channel}" from IPC_CHANNELS is missing in src/preload/index.ts.\n` +
          'Either update the preload bridge or remove the channel from ipc-channels.ts.',
      ).toContain(channel);
    },
  );

  it('preload does not reference channels absent from IPC_CHANNELS (no orphan literals)', () => {
    const channelPattern = /['"`]([a-z]+:[a-z][a-z0-9-]+)['"`]/g;
    const foundInPreload = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = channelPattern.exec(preloadSource)) !== null) {
      const ch = match[1];
      if (ch !== undefined) foundInPreload.add(ch);
    }

    const channelSet = new Set(allChannels);
    const orphans = [...foundInPreload].filter((ch) => !channelSet.has(ch));

    expect(
      orphans,
      `Preload references channels not declared in IPC_CHANNELS: ${orphans.join(', ')}.\n` +
        'Add them to ipc-channels.ts or remove the literal from the preload bridge.',
    ).toHaveLength(0);
  });
});
