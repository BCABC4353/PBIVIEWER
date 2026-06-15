import * as path from 'path';

const approvedPaths = new Set<string>();

export function approveExportPath(filePath: string): void {
  approvedPaths.add(path.resolve(filePath));
}

export function consumeExportPath(filePath: string): boolean {
  return approvedPaths.delete(path.resolve(filePath));
}
