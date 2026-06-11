
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  interface Listener {
    event: string;
    fn: (...args: unknown[]) => void;
    kind: 'on' | 'once';
  }

  class FakeWebContents {
    listeners: Listener[] = [];
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

type ExportResult =
  | { success: true; data: { path: string } }
  | { success: false; error: { code: string; message: string } };

const asResult = (r: Awaited<ReturnType<typeof exportCurrentViewPdf>>) =>
  r as ExportResult;

const VALID_PATH = '/home/user/Downloads/report.pdf';

function makeMainWindow() {
  return { webContents: new FakeWebContents() } as unknown as import('electron').BrowserWindow;
}

async function runExport(emit: 'finish' | 'fail') {
  const mainWindow = makeMainWindow();
  const promise = exportCurrentViewPdf(mainWindow, { filePath: VALID_PATH });

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
    expect(pdfWin.close).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate load listeners across repeated exports', async () => {
    for (let i = 0; i < 3; i++) {
      const { pdfWin } = await runExport('finish');
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
