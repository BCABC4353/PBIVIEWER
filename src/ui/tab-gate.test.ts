import { describe, expect, it } from 'vitest';
import { gateTabBody } from './tab-gate';

describe('gateTabBody', () => {
  it('Fleet and Alerts always render from the data source — mock mode included', () => {
    expect(gateTabBody('fleet', 'mock', false)).toBe('data');
    expect(gateTabBody('alerts', 'mock', false)).toBe('data');
    expect(gateTabBody('fleet', 'live', true)).toBe('data');
    expect(gateTabBody('alerts', 'live', true)).toBe('data');
  });

  it('Reports in mock mode shows the sample-mode card, not the connect card', () => {
    expect(gateTabBody('reports', 'mock', false)).toBe('sample-reports-card');
  });

  it('Reports in live mode with a model shows the live list', () => {
    expect(gateTabBody('reports', 'live', true)).toBe('data');
  });

  it('Reports in live mode without a model falls back to the connect card', () => {
    expect(gateTabBody('reports', 'live', false)).toBe('connect-card');
  });
});
