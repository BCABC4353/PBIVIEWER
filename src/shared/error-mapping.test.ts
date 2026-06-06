import { describe, it, expect } from 'vitest';
import { friendlyApiError, friendlyApiErrorFromMessage } from './error-mapping';

describe('friendlyApiError', () => {
  it('maps 401 to session-expired copy', () => {
    expect(friendlyApiError(401)).toBe('Your session expired. Please sign in again.');
  });

  it('maps 403 to access-denied copy', () => {
    expect(friendlyApiError(403)).toBe('You do not have access to this content.');
  });

  it('maps 404 to not-found copy', () => {
    expect(friendlyApiError(404)).toBe('This item was not found. It may have been moved or removed.');
  });

  it('maps 429 to throttle copy', () => {
    expect(friendlyApiError(429)).toBe('Power BI is throttling requests. Please wait a moment and try again.');
  });

  it('maps every 5xx in [500, 600) to service-unavailable copy', () => {
    const unavailable = 'Power BI is currently unavailable. Please try again in a moment.';
    expect(friendlyApiError(500)).toBe(unavailable);
    expect(friendlyApiError(502)).toBe(unavailable);
    expect(friendlyApiError(503)).toBe(unavailable);
    expect(friendlyApiError(599)).toBe(unavailable);
  });

  it('falls back to generic copy for unknown status codes', () => {
    expect(friendlyApiError(418)).toBe('Something went wrong. Please try again.');
  });

  it('falls back to generic copy when status is undefined', () => {
    expect(friendlyApiError(undefined)).toBe('Something went wrong. Please try again.');
  });

  it('ignores the raw body parameter (kept for future structured parsing)', () => {
    // The raw body is intentionally not surfaced (PII / authz leaks).
    const fromStatus = friendlyApiError(403);
    const fromStatusAndRaw = friendlyApiError(403, 'user@contoso.com lacks access');
    expect(fromStatusAndRaw).toBe(fromStatus);
  });
});

describe('friendlyApiErrorFromMessage', () => {
  it('extracts 403 from "Failed to fetch workspaces: 403 - You do not have access"', () => {
    expect(
      friendlyApiErrorFromMessage('Failed to fetch workspaces: 403 - You do not have access'),
    ).toBe('You do not have access to this content.');
  });

  it('extracts 429 even when body is empty', () => {
    expect(friendlyApiErrorFromMessage('Failed to fetch reports: 429 - ')).toBe(
      'Power BI is throttling requests. Please wait a moment and try again.',
    );
  });

  it('returns the input unchanged when no status code is embedded', () => {
    expect(friendlyApiErrorFromMessage('Failed to refresh access token')).toBe(
      'Failed to refresh access token',
    );
  });

  it('extracts 500 from a generic server error message', () => {
    expect(friendlyApiErrorFromMessage('Server error: 500 - Internal Server Error')).toBe(
      'Power BI is currently unavailable. Please try again in a moment.',
    );
  });

  it('handles contexts containing colons without misparsing', () => {
    // The regex pins on ": <3-digit> - " — leading colons in the context
    // (e.g. "module:submodule") should not be mistaken for the separator.
    expect(
      friendlyApiErrorFromMessage('module:submodule: 401 - token expired'),
    ).toBe('Your session expired. Please sign in again.');
  });

  it('returns the input unchanged when the colon/dash shape matches but the status is non-numeric', () => {
    // The regex requires \d{3}, so "abc - body" does NOT match and the input
    // should be returned verbatim.
    expect(friendlyApiErrorFromMessage('Bad message: abc - body')).toBe(
      'Bad message: abc - body',
    );
  });
});
