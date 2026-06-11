import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fsp } from 'fs';

const OUT_PATH = join(tmpdir(), 'pbiviewer-export-test.pdf');
const TMP_PATH = `${OUT_PATH}.${process.pid}.tmp`;


const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

vi.mock('../security', () => ({
  isValidExportPath: () => true,
}));
vi.mock('../../shared/validation', () => ({
  validateUUID: (v: unknown) => (typeof v === 'string' ? v : null),
}));

const exportReportToPdf = vi.fn();
vi.mock('../services/powerbi-api', () => ({
  powerbiApiService: {
    exportReportToPdf: (...args: unknown[]) => exportReportToPdf(...args),
  },
}));

let writeFileSpy: ReturnType<typeof vi.spyOn>;
let rmSpy: ReturnType<typeof vi.spyOn>;
let renameSpy: ReturnType<typeof vi.spyOn>;

import { registerContentIpc } from './content';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const CHANNEL = 'content:export-report-pdf';

interface IpcErr {
  success: false;
  error: { code: string; message: string };
}

async function invokeExport(pageName?: string, bookmarkState?: string) {
  const fn = handlers.get(CHANNEL);
  if (!fn) throw new Error('export handler not registered');
  return (await fn(
    {},
    VALID_UUID,
    VALID_UUID,
    pageName,
    bookmarkState,
    OUT_PATH,
  )) as { success: boolean } & Partial<IpcErr>;
}

beforeEach(() => {
  handlers.clear();
  exportReportToPdf.mockReset();
  exportReportToPdf.mockResolvedValue({ success: true, data: Buffer.from('pdf') });
  writeFileSpy = vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined) as ReturnType<typeof vi.spyOn>;
  rmSpy = vi.spyOn(fsp, 'rm').mockResolvedValue(undefined) as ReturnType<typeof vi.spyOn>;
  renameSpy = vi.spyOn(fsp, 'rename').mockResolvedValue(undefined) as ReturnType<typeof vi.spyOn>;
  registerContentIpc();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content:export-report-pdf input caps (FIX-5 / G2)', () => {
  it('rejects an over-length pageName with INVALID_INPUT and never calls the service', async () => {
    const res = await invokeExport('x'.repeat(257));
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_INPUT');
    expect(exportReportToPdf).not.toHaveBeenCalled();
  });

  it('rejects an over-length bookmarkState with INVALID_INPUT', async () => {
    const res = await invokeExport('Page1', 'b'.repeat(64 * 1024 + 1));
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_INPUT');
    expect(exportReportToPdf).not.toHaveBeenCalled();
  });

  it('accepts inputs at the limit and forwards them to the service', async () => {
    const res = await invokeExport('x'.repeat(256), 'b'.repeat(64 * 1024));
    expect(res.success).toBe(true);
    expect(exportReportToPdf).toHaveBeenCalledWith(
      VALID_UUID,
      VALID_UUID,
      'x'.repeat(256),
      'b'.repeat(64 * 1024),
    );
  });

  it('accepts a normal export with no page/bookmark args', async () => {
    const res = await invokeExport();
    expect(res.success).toBe(true);
    expect(exportReportToPdf).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(TMP_PATH, Buffer.from('pdf'));
    expect(renameSpy).toHaveBeenCalledWith(TMP_PATH, OUT_PATH);
  });
});

describe('content:export-report-pdf write failures resolve to an IPC envelope (never reject)', () => {
  it('returns EXPORT_WRITE_FAILED when the rename fails, and still cleans up the temp file', async () => {
    renameSpy.mockRejectedValue(new Error('EBUSY: resource busy or locked'));

    await expect(invokeExport()).resolves.toEqual({
      success: false,
      error: {
        code: 'EXPORT_WRITE_FAILED',
        message: expect.stringContaining('EBUSY'),
      },
    });

    expect(rmSpy).toHaveBeenCalledWith(TMP_PATH, { force: true });
  });

  it('returns EXPORT_WRITE_FAILED when the temp write itself fails', async () => {
    writeFileSpy.mockRejectedValue(new Error('ENOSPC: no space left on device'));

    await expect(invokeExport()).resolves.toEqual({
      success: false,
      error: {
        code: 'EXPORT_WRITE_FAILED',
        message: expect.stringContaining('ENOSPC'),
      },
    });

    expect(renameSpy).not.toHaveBeenCalled();
    expect(rmSpy).toHaveBeenCalledWith(TMP_PATH, { force: true });
  });

  it('still reports EXPORT_WRITE_FAILED when the temp-file cleanup also fails', async () => {
    renameSpy.mockRejectedValue(new Error('EPERM: operation not permitted'));
    rmSpy.mockRejectedValue(new Error('EPERM: operation not permitted'));

    await expect(invokeExport()).resolves.toEqual({
      success: false,
      error: {
        code: 'EXPORT_WRITE_FAILED',
        message: expect.stringContaining('EPERM'),
      },
    });
  });
});
