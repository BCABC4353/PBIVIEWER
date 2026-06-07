import { describe, it, expect } from 'vitest';
import { getErrorMessage, isTokenExpiredError } from './powerbi-errors';

describe('getErrorMessage', () => {
  it('returns empty string for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(getErrorMessage(null)).toBe('');
  });

  it('returns empty string for empty string input (falsy short-circuit)', () => {
    expect(getErrorMessage('')).toBe('');
  });

  it('returns string detail unchanged', () => {
    expect(getErrorMessage('boom')).toBe('boom');
  });

  it('returns Error.message for Error instances', () => {
    expect(getErrorMessage(new Error('kaboom'))).toBe('kaboom');
  });

  it('reads object.message', () => {
    expect(getErrorMessage({ message: 'top-level message' })).toBe('top-level message');
  });

  it('falls back to detailedMessage when message is absent', () => {
    expect(getErrorMessage({ detailedMessage: 'detailed' })).toBe('detailed');
  });

  it('falls back to error.message when top-level fields absent', () => {
    expect(getErrorMessage({ error: { message: 'nested message' } })).toBe('nested message');
  });

  it('falls back to error.code when error.message absent', () => {
    expect(getErrorMessage({ error: { code: 'NestedCode' } })).toBe('NestedCode');
  });

  it('falls back to errorCode when error.* absent', () => {
    expect(getErrorMessage({ errorCode: 'TopCode' })).toBe('TopCode');
  });

  it('returns the most specific field when multiple are present (message wins)', () => {
    expect(
      getErrorMessage({
        message: 'win',
        detailedMessage: 'lose',
        error: { message: 'also lose', code: 'lose-code' },
        errorCode: 'lose-too',
      }),
    ).toBe('win');
  });

  it('returns empty string for objects with none of the known fields', () => {
    expect(getErrorMessage({ irrelevant: 'data' })).toBe('');
  });

  it('coerces non-string field values to strings', () => {
    expect(getErrorMessage({ message: 42 })).toBe('42');
  });

  it('returns empty string for unsupported primitive types (numbers, booleans)', () => {
    expect(getErrorMessage(42)).toBe('');
    expect(getErrorMessage(true)).toBe('');
  });
});

describe('isTokenExpiredError', () => {
  it('detects "tokenexpired" substring (Power BI shape)', () => {
    expect(isTokenExpiredError({ errorCode: 'TokenExpired' })).toBe(true);
  });

  it('detects "token expired" with whitespace', () => {
    expect(isTokenExpiredError('Token expired, please re-auth')).toBe(true);
  });

  it('detects "accesstokenexpired"', () => {
    expect(isTokenExpiredError({ message: 'AccessTokenExpired' })).toBe(true);
  });

  it('detects "invalidauthenticationtoken"', () => {
    expect(isTokenExpiredError({ error: { code: 'InvalidAuthenticationToken' } })).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isTokenExpiredError(new Error('Network unreachable'))).toBe(false);
  });

  it('returns false for empty / nullish details', () => {
    expect(isTokenExpiredError(undefined)).toBe(false);
    expect(isTokenExpiredError(null)).toBe(false);
    expect(isTokenExpiredError('')).toBe(false);
  });
});
