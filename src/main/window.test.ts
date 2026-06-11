import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

class FakeWebContents {
  handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void): void {
    this.handlers.set(event, fn);
  }
  setWindowOpenHandler(): void {}
  openDevTools(): void {}
}

class FakeBrowserWindow {
  webContents = new FakeWebContents();
  handlers = new Map<string, (...args: unknown[]) => void>();
  destroyed = false;
  reload = vi.fn();
  loadFile = vi.fn();
  loadURL = vi.fn();
  show = vi.fn();
  once(_event: string, _fn: (...args: unknown[]) => void): void {}
  on(event: string, fn: (...args: unknown[]) => void): void {
    this.handlers.set(event, fn);
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  crash(reason = 'crashed'): void {
    this.webContents.handlers.get('render-process-gone')!({}, { reason });
  }
  close(): void {
    this.handlers.get('closed')!();
  }
}

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: FakeBrowserWindow,
  shell: { openExternal: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false },
}));

vi.mock('./services/settings-service', () => ({
  settingsService: {
    getSettings: () => ({ success: true, data: { theme: 'light' } }),
  },
}));

let createWindow: typeof import('./window').createWindow;
let getMainWindow: typeof import('./window').getMainWindow;

beforeAll(async () => {
  ({ createWindow, getMainWindow } = await import('./window'));
});

function bootWindow(): FakeBrowserWindow {
  createWindow();
  return getMainWindow() as unknown as FakeBrowserWindow;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  const win = getMainWindow() as unknown as FakeBrowserWindow | null;
  if (win) win.close();
  vi.useRealTimers();
});

describe('kiosk crash-recovery loop (render-process-gone)', () => {
  it('reloads immediately for up to three fast crashes', () => {
    const win = bootWindow();
    for (let i = 1; i <= 3; i++) {
      win.crash();
      expect(win.reload).toHaveBeenCalledTimes(i);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the fourth fast crash arms a single 60s backoff reload instead of reloading immediately', () => {
    const win = bootWindow();
    for (let i = 0; i < 4; i++) win.crash();

    expect(win.reload).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);

    win.crash();
    expect(win.reload).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(60_000 - 1);
    expect(win.reload).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(1);
    expect(win.reload).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the armed backoff timer when the window closes', () => {
    const win = bootWindow();
    for (let i = 0; i < 4; i++) win.crash();
    expect(vi.getTimerCount()).toBe(1);

    win.close();

    expect(vi.getTimerCount()).toBe(0);
    expect(getMainWindow()).toBeNull();
    vi.advanceTimersByTime(120_000);
    expect(win.reload).toHaveBeenCalledTimes(3);
  });

  it('ignores clean-exit terminations', () => {
    const win = bootWindow();
    win.crash('clean-exit');
    expect(win.reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('crashes spaced beyond the 60s window reset the fast-crash budget', () => {
    const win = bootWindow();
    for (let i = 0; i < 3; i++) win.crash();
    expect(win.reload).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(61_000);

    win.crash();
    expect(win.reload).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the backoff reload skips a window that was destroyed while the timer was pending', () => {
    const win = bootWindow();
    for (let i = 0; i < 4; i++) win.crash();
    expect(vi.getTimerCount()).toBe(1);

    win.destroyed = true;
    vi.advanceTimersByTime(60_000);
    expect(win.reload).toHaveBeenCalledTimes(3);
  });
});
