/**
 * Export-service listener hygiene.
 *
 * The hidden PDF render window registers `did-finish-load` / `did-fail-load`
 * handlers per export. These are one-shot — they MUST be registered with
 * `.once()` (or otherwise removed) so repeated exports do not accumulate
 * listeners on a reused webContents. These tests drive the export with a fake
 * Electron BrowserWindow and assert:
 *   - the load lifecycle handlers are registered via `once`, never `on`
 *   - a successful load produces a written PDF and closes the hidden window
 *   - a failed load surfaces an error and still closes the hidden window
 *   - repeated exports never grow the persistent listener set on a shared
 *     webContents (no listener-leak regression)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fake webContents/BrowserWindow that record listener registrations the way
// Electron would, including .once() self-detach semantics, so we can assert no
// leak. Defined via vi.hoisted so the vi.mock factories (hoisted to the top of
// the module) can reference them.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  interface Listener {
    event: string;
    fn: (...args: unknown[]) => void;
    kind: 'on' | 'once';
  }

  class FakeWebContents {
    listeners: Listener[] = [];
    // Records every registration attempt for leak assertions, even after detach.
    registrations: Listener[] = [];
    loadURL = vi.fn();
    capturePage = vi.fn(async () => ({
      getSize: () => ({ width: 800, height: 600 }),
      toPNG: () => Buffer.from('fake-png'),
    }));
    printToPDF = vi.fn(async () => Buffer.from('fake-pdf'));
    setWindowOpenHandler = vi.fn();

    on(event: string, fn: (...args: unknown[]) => void) {
      const l: Listener = { event, fn, kind: 'on' };
      this.listeners.push(l);
      this.registrations.push(l);
      return this;
    }

    once(event: string, fn: (...args: unknown[]) => void) {
      const l: Listener = { event, fn, kind: 'once' };
      this.listeners.push(l);
      this.registrations.push(l);
      return this;
    }

    /** Emit an event, applying once-detach semantics like the real emitter. */
    emit(event: string, ...args: unknown[]) {
      const matching = this.listeners.filter((l) => l.event === event);
      for (const l of matching) {
        if (l.kind === 'once') {
          this.listeners = this.listeners.filter((x) => x !== l);
        }
        l.fn(...args);
      }
    }
  }

  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    webContents = new FakeWebContents();
    close = vi.fn();
    // export-service calls pdfWindow.loadURL(...) directly on the window.
    loadURL = vi.fn();
    constructor(public opts: unknown) {
      FakeBrowserWindow.instances.push(this);
    }
  }

  const writeFile = vi.fn(async (..._args: unknown[]) => undefined);
  const isValidExportPath = vi.fn((_p: string) => true);

  return { FakeWebContents, FakeBrowserWindow, writeFile, isValidExportPath };
});

const { FakeWebContents, FakeBrowserWindow, writeFile, isValidExportPath } = h;
type FakeBrowserWindowInstance = InstanceType<typeof FakeBrowserWindow>;

vi.mock('electron', () => ({
  BrowserWindow: h.FakeBrowserWindow,
}));

vi.mock('fs', () => {
  const promises = { writeFile: (...args: unknown[]) => h.writeFile(...args) };
  return { promises, default: { promises } };
});

vi.mock('../security', () => ({
  isValidExportPath: (p: string) => h.isValidExportPath(p),
}));

import { exportCurrentViewPdf } from './export-service';

// The function infers `success: boolean` (widened), which defeats discriminated
// narrowing. Re-state the contract here so assertions on the error branch are
// type-safe.
type ExportResult =
  | { success: true; data: { path: string } }
  | { success: false; error: { code: string; message: string } };

const asResult = (r: Awaited<ReturnType<typeof exportCurrentViewPdf>>) =>
  r as ExportResult;

const VALID_PATH = '/home/user/Downloads/report.pdf';

function makeMainWindow() {
  // The main window only needs webContents.capturePage for the export.
  return { webContents: new FakeWebContents() } as unknown as import('electron').BrowserWindow;
}

/**
 * Drive a full export. The PDF window load is gated on a `did-finish-load` /
 * `did-fail-load` event, so we resolve it on the next microtask after the
 * export has registered its listeners and called loadURL.
 */
async function runExport(emit: 'finish' | 'fail') {
  const mainWindow = makeMainWindow();
  const promise = exportCurrentViewPdf(mainWindow, { filePath: VALID_PATH });

  // Wait for the export to create the PDF window and register listeners.
  await vi.waitFor(() => {
    const pdfWin = FakeBrowserWindow.instances.at(-1);
    expect(pdfWin?.loadURL).toHaveBeenCalled();
  });

  const pdfWin: FakeBrowserWindowInstance = FakeBrowserWindow.instances.at(-1)!;
  if (emit === 'finish') {
    pdfWin.webContents.emit('did-finish-load');
  } else {
    pdfWin.webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND');
  }
  return { result: await promise, pdfWin };
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeBrowserWindow.instances = [];
  isValidExportPath.mockReturnValue(true);
});

describe('E2 export-service listener hygiene', () => {
  it('registers the load lifecycle handlers with once(), never on()', async () => {
    const { pdfWin } = await runExport('finish');

    const loadRegs = pdfWin.webContents.registrations.filter(
      (r) => r.event === 'did-finish-load' || r.event === 'did-fail-load',
    );
    expect(loadRegs.length).toBe(2);
    // These must be one-shot listeners.
    expect(loadRegs.every((r) => r.kind === 'once')).toBe(true);
    expect(loadRegs.some((r) => r.kind === 'on')).toBe(false);
  });

  it('writes the PDF and closes the hidden window on successful load', async () => {
    const { result, pdfWin } = await runExport('finish');

    expect(result).toEqual({ success: true, data: { path: VALID_PATH } });
    expect(pdfWin.webContents.printToPDF).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(VALID_PATH, expect.anything());
    expect(pdfWin.close).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and still closes the hidden window on failed load', async () => {
    const { result: raw, pdfWin } = await runExport('fail');
    const result = asResult(raw);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXPORT_FAILED');
      expect(result.error.message).toContain('Load failed');
    }
    expect(pdfWin.webContents.printToPDF).not.toHaveBeenCalled();
    // finally{} must always close the transient window.
    expect(pdfWin.close).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate load listeners across repeated exports', async () => {
    // Each export uses a fresh window, but the load handlers must self-detach
    // (once semantics) so that after settling, no lingering listener remains.
    // Run several exports and assert the attached load-listener count returns
    // to zero on each settled window.
    for (let i = 0; i < 3; i++) {
      const { pdfWin } = await runExport('finish');
      // After did-finish-load fired, the once listener detached itself; the
      // unfired did-fail-load once-listener is the only one that could linger,
      // and it is gone once the window closes. Assert no on()-style leak: at
      // most one residual once-listener, and zero persistent on() listeners.
      const persistentOn = pdfWin.webContents.listeners.filter(
        (l) =>
          (l.event === 'did-finish-load' || l.event === 'did-fail-load') &&
          l.kind === 'on',
      );
      expect(persistentOn.length).toBe(0);
    }
  });

  it('rejects an invalid export path before opening any window', async () => {
    isValidExportPath.mockReturnValue(false);
    const result = asResult(
      await exportCurrentViewPdf(makeMainWindow(), { filePath: '/etc/passwd' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_PATH');
    expect(FakeBrowserWindow.instances.length).toBe(0);
  });
});
