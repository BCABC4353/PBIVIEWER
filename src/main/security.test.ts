import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const dirs = vi.hoisted(() => {
  const fsh = require('fs') as typeof import('fs');
  const osh = require('os') as typeof import('os');
  const pathh = require('path') as typeof import('path');
  const base = fsh.mkdtempSync(pathh.join(osh.tmpdir(), 'pbiviewer-sec-'));
  const downloads = pathh.join(base, 'Downloads');
  const desktop = pathh.join(base, 'Desktop');
  const documents = pathh.join(base, 'Documents');
  const outside = pathh.join(base, 'Outside');
  for (const d of [downloads, desktop, documents, outside]) fsh.mkdirSync(d);
  return { base, downloads, desktop, documents, outside };
});

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'downloads') return dirs.downloads;
      if (name === 'desktop') return dirs.desktop;
      if (name === 'documents') return dirs.documents;
      return dirs.base;
    },
  },
  shell: { openExternal: vi.fn() },
}));

import { isValidExportPath } from './security';

describe('isValidExportPath', () => {
  it('accepts a .pdf in an allowed root', () => {
    expect(isValidExportPath(path.join(dirs.downloads, 'report.pdf'))).toBe(true);
    expect(isValidExportPath(path.join(dirs.desktop, 'report.PDF'))).toBe(true);
    expect(isValidExportPath(path.join(dirs.documents, 'sub-less', 'r.pdf'))).toBe(false);
  });

  it('accepts a .pdf in an existing subdirectory of an allowed root', () => {
    const sub = path.join(dirs.downloads, 'exports');
    fs.mkdirSync(sub, { recursive: true });
    expect(isValidExportPath(path.join(sub, 'report.pdf'))).toBe(true);
  });

  it('rejects paths outside the allowed roots', () => {
    expect(isValidExportPath(path.join(dirs.outside, 'report.pdf'))).toBe(false);
    expect(isValidExportPath('/etc/report.pdf')).toBe(false);
  });

  it('rejects non-pdf extensions', () => {
    expect(isValidExportPath(path.join(dirs.downloads, 'report.exe'))).toBe(false);
    expect(isValidExportPath(path.join(dirs.downloads, 'report'))).toBe(false);
  });

  it('rejects .. traversal that escapes an allowed root', () => {
    expect(isValidExportPath(path.join(dirs.downloads, '..', 'Outside', 'r.pdf'))).toBe(false);
  });

  it('rejects a path whose parent directory does not exist', () => {
    expect(isValidExportPath(path.join(dirs.downloads, 'nope', 'r.pdf'))).toBe(false);
  });

  it('rejects when the parent directory is a symlink escaping the allowed root', () => {
    const link = path.join(dirs.downloads, 'sneaky');
    try {
      fs.symlinkSync(dirs.outside, link, 'dir');
    } catch {
      return;
    }
    expect(isValidExportPath(path.join(link, 'report.pdf'))).toBe(false);
  });

  it('rejects when the target file itself is a symlink', () => {
    const target = path.join(dirs.outside, 'victim.pdf');
    fs.writeFileSync(target, 'x');
    const link = path.join(dirs.downloads, 'linked.pdf');
    try {
      fs.symlinkSync(target, link, 'file');
    } catch {
      return;
    }
    expect(isValidExportPath(link)).toBe(false);
  });
});
