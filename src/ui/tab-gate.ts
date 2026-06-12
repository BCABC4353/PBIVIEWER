import type { DataMode } from '../core/data-source-factory';

export type GateTab = 'fleet' | 'reports' | 'alerts';
export type GateBody = 'data' | 'sample-reports-card' | 'connect-card';

export function gateTabBody(tab: GateTab, mode: DataMode, hasReportsModel: boolean): GateBody {
  if (tab !== 'reports') return 'data';
  if (hasReportsModel) return 'data';
  return mode === 'mock' ? 'sample-reports-card' : 'connect-card';
}
