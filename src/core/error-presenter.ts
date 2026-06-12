export type ErrorKind = 'auth' | 'offline' | 'forbidden' | 'throttled' | 'unknown';

export interface PresentableError {
  kind: ErrorKind;
  title: string;
  body: string;
  retry: boolean;
  signIn: boolean;
  detail?: string;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const AUTH_RE =
  /\b401\b|not signed in|session expired|sign in again|invalid_grant|AADSTS|token ?expired|unauthorized/i;
const FORBIDDEN_RE = /\b403\b|forbidden/i;
const THROTTLED_RE = /\b429\b|too\s*many\s*requests|throttl/i;
const OFFLINE_RE = /network request failed|failed to fetch|network error|internet|offline/i;

export function classifyError(message: string): ErrorKind {
  if (AUTH_RE.test(message)) return 'auth';
  if (FORBIDDEN_RE.test(message)) return 'forbidden';
  if (THROTTLED_RE.test(message)) return 'throttled';
  if (OFFLINE_RE.test(message)) return 'offline';
  return 'unknown';
}

export function presentError(e: unknown, what: string): PresentableError {
  const detail = errorMessage(e);
  const kind = classifyError(detail);
  switch (kind) {
    case 'auth':
      return {
        kind,
        title: 'Session expired',
        body: 'Your sign-in is no longer valid. Sign in again to keep reading your Power BI data.',
        retry: false,
        signIn: true,
      };
    case 'offline':
      return {
        kind,
        title: "Couldn't reach Power BI",
        body: 'Check your connection and try again.',
        retry: true,
        signIn: false,
      };
    case 'forbidden':
      return {
        kind,
        title: 'No access',
        body: `Your account doesn't have permission to read ${what}. Ask the owner to share it with you.`,
        retry: true,
        signIn: false,
      };
    case 'throttled':
      return {
        kind,
        title: 'Power BI is busy',
        body: 'Too many requests right now. Wait a moment and try again.',
        retry: true,
        signIn: false,
      };
    case 'unknown':
      return {
        kind,
        title: `Couldn't load ${what}`,
        body: 'Something went wrong talking to Power BI.',
        retry: true,
        signIn: false,
        detail,
      };
  }
}
