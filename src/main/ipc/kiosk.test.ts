
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/ipc-types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

let nextBlockerId = 1;
const activeBlockers = new Set<number>();
const startSpy = vi.fn((_type: string) => {
  const id = nextBlockerId++;
  activeBlockers.add(id);
  return id;
});
const stopSpy = vi.fn((id: number) => {
  activeBlockers.delete(id);
});
const isStartedSpy = vi.fn((id: number) => activeBlockers.has(id));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  powerSaveBlocker: {
    start: (type: string) => startSpy(type),
    stop: (id: number) => stopSpy(id),
    isStarted: (id: number) => isStartedSpy(id),
  },
}));

import { registerKioskIpc } from './kiosk';

async function invoke<T>(channel: string): Promise<IPCResponse<T>> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler for ${channel}`);
  return (await fn()) as IPCResponse<T>;
}

const PREVENT = IPC_CHANNELS.kiosk.preventDisplaySleep;
const ALLOW = IPC_CHANNELS.kiosk.allowDisplaySleep;

describe('PROD-S1 kiosk IPC handlers', () => {
  beforeEach(() => {
    handlers.clear();
    activeBlockers.clear();
    nextBlockerId = 1;
    startSpy.mockClear();
    stopSpy.mockClear();
    isStartedSpy.mockClear();
    registerKioskIpc();
  });

  it('registers both kiosk channels', () => {
    expect(handlers.has(PREVENT)).toBe(true);
    expect(handlers.has(ALLOW)).toBe(true);
  });

  it('prevent-display-sleep starts a blocker and reports active', async () => {
    const res = await invoke<boolean>(PREVENT);
    expect(res).toEqual({ success: true, data: true });
    expect(startSpy).toHaveBeenCalledWith('prevent-display-sleep');
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('does not start a second blocker on double-start (no leak)', async () => {
    await invoke(PREVENT);
    await invoke(PREVENT);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(activeBlockers.size).toBe(1);
  });

  it('allow-display-sleep stops the active blocker', async () => {
    await invoke(PREVENT);
    const res = await invoke<boolean>(ALLOW);
    expect(res).toEqual({ success: true, data: false });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(activeBlockers.size).toBe(0);
  });

  it('allow-display-sleep is a no-op when no blocker is active', async () => {
    const res = await invoke<boolean>(ALLOW);
    expect(res).toEqual({ success: true, data: false });
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('start → stop → start cycles cleanly (fresh blocker each cycle)', async () => {
    await invoke(PREVENT);
    await invoke(ALLOW);
    await invoke(PREVENT);
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(activeBlockers.size).toBe(1);
  });

  it('recovers from a stale id released out-of-band (starts a fresh blocker)', async () => {
    await invoke(PREVENT);
    activeBlockers.clear();
    const res = await invoke<boolean>(PREVENT);
    expect(res).toEqual({ success: true, data: true });
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(activeBlockers.size).toBe(1);
  });
});
