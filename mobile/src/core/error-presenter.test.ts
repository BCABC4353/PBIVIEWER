import { describe, expect, it } from 'vitest';
import { classifyError, errorMessage, presentError } from './error-presenter';

describe('classifyError', () => {
  it('maps 401s and token-manager wording to auth', () => {
    expect(classifyError('Power BI API 401 on /groups')).toBe('auth');
    expect(classifyError('Not signed in')).toBe('auth');
    expect(classifyError('Session expired — sign in again')).toBe('auth');
    expect(classifyError('AADSTS70000: invalid_grant')).toBe('auth');
    expect(classifyError('Execute Queries failed (HTTP 401) on dataset d1')).toBe('auth');
  });

  it('maps 403 to forbidden', () => {
    expect(classifyError('Power BI API 403 on /groups/x/datasets')).toBe('forbidden');
  });

  it('maps 429 to throttled', () => {
    expect(classifyError('Power BI API 429 on /groups')).toBe('throttled');
    expect(classifyError('TooManyRequests')).toBe('throttled');
  });

  it('maps fetch-level failures to offline', () => {
    expect(classifyError('Network request failed')).toBe('offline');
    expect(classifyError('TypeError: Failed to fetch')).toBe('offline');
  });

  it('does not read digits embedded in ids as status codes', () => {
    expect(classifyError('dataset ab4017cd returned nothing')).toBe('unknown');
  });

  it('falls back to unknown', () => {
    expect(classifyError('Every workspace failed to load — check sign-in and network.')).toBe(
      'unknown',
    );
  });
});

describe('presentError', () => {
  it('auth errors get the session-expired copy with a sign-in action and no raw string', () => {
    const p = presentError(new Error('Power BI API 401 on /groups'), 'your fleet');
    expect(p.kind).toBe('auth');
    expect(p.title).toBe('Session expired');
    expect(p.signIn).toBe(true);
    expect(p.retry).toBe(false);
    expect(p.detail).toBeUndefined();
  });

  it('offline errors are retryable', () => {
    const p = presentError(new TypeError('Network request failed'), 'alerts');
    expect(p.kind).toBe('offline');
    expect(p.retry).toBe(true);
    expect(p.signIn).toBe(false);
  });

  it('forbidden errors name what could not be read', () => {
    const p = presentError(new Error('Power BI API 403 on /groups'), 'this report');
    expect(p.kind).toBe('forbidden');
    expect(p.body).toContain('this report');
  });

  it('throttled errors ask the user to wait', () => {
    const p = presentError(new Error('Power BI API 429 on /groups'), 'your reports');
    expect(p.kind).toBe('throttled');
    expect(p.retry).toBe(true);
  });

  it('unknown errors keep the raw message available as detail', () => {
    const p = presentError(new Error('weird and novel'), 'your fleet');
    expect(p.kind).toBe('unknown');
    expect(p.title).toContain('your fleet');
    expect(p.detail).toBe('weird and novel');
    expect(p.retry).toBe(true);
  });

  it('non-Error values are stringified', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(presentError('plain string', 'x').detail).toBe('plain string');
  });
});
