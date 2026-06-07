import { registerWindowIpc } from './window';
import { registerAuthIpc } from './auth';
import { registerContentIpc } from './content';
import { registerSettingsIpc } from './settings';
import { registerExportIpc } from './export';
import { registerUsageIpc } from './usage';
import { registerAppIpc } from './app';
import { registerLogIpc } from './log';

// Registers every domain IPC module. Order mirrors the original monolithic
// index.ts: window controls, auth, content, settings, export, usage, app, log.
export function registerAllIpcHandlers(): void {
  registerWindowIpc();
  registerAuthIpc();
  registerContentIpc();
  registerSettingsIpc();
  registerExportIpc();
  registerUsageIpc();
  registerAppIpc();
  registerLogIpc();
}
