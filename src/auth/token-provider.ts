import type { TokenProvider } from '../core/types';
import { getAccessToken } from './msal-auth';

export const authTokenProvider: TokenProvider = {
  getAccessToken: () => getAccessToken(),
};

export function createTokenProvider(): TokenProvider {
  return authTokenProvider;
}
