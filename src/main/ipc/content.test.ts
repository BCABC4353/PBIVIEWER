import { describe, it, expect, vi, beforeEach } from 'vitest';

// FIX-5 (G2 DoS hardening): the export-PDF IPC handler must cap renderer-supplied
// pageName / bookmarkState before they reach the outbound Power BI request body.

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

// Always treat the path as valid + accept the UUIDs so we isolate the cap logic.
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

const writeFile = vi.fn().mockResolvedValue(undefined);
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: { ...actual.promises, writeFile: (...args: unknown[]) => writeFile(...args) },
  };
});

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
    '/home/user/out.pdf',
  )) as { success: boolean } & Partial<IpcErr>;
}

beforeEach(() => {
  handlers.clear();
  exportReportToPdf.mockReset();
  exportReportToPdf.mockResolvedValue({ success: true, data: Buffer.from('pdf') });
  writeFile.mockClear();
  registerContentIpc();
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
  });
});
