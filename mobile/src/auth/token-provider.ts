/**
 * Adapts the auth module to the core TokenProvider seam (src/core/types.ts) —
 * the same injection point the desktop's ApiAuthPort provides, so
 * LiveFleetClient never knows which auth implementation feeds it.
 */
import type { TokenProvider } from '../core/types';
import { getAccessToken } from './msal-auth';

export const authTokenProvider: TokenProvider = {
  getAccessToken: () => getAccessToken(),
};

/** Factory form, for callers that prefer explicit construction. */
export function createTokenProvider(): TokenProvider {
  return authTokenProvider;
}
