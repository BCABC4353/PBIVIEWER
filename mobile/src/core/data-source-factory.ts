/**
 * Data-source factory + persisted mode switch.
 *
 * 'mock' = sample fleet (no sign-in, default — the app must render
 *          end-to-end in Expo Go out of the box).
 * 'live' = real Power BI REST via LiveFleetClient + the MSAL-style auth
 *          module (sign in once, silent refresh thereafter).
 *
 * The saved mode lives in SecureStore alongside the tokens — tiny value,
 * and it keeps all persistence behind one well-understood API.
 */
import * as SecureStore from 'expo-secure-store';
import type { DataSource } from './types';
import { MockDataSource } from './mock-data';
import { LiveFleetClient } from './fleet-client';
import { authTokenProvider } from '../auth/token-provider';

export type DataMode = 'mock' | 'live';

const MODE_KEY = 'pbiviewer.data.mode';

export function createDataSource(mode: DataMode): DataSource {
  return mode === 'live'
    ? new LiveFleetClient(authTokenProvider)
    : new MockDataSource();
}

/** Persisted mode; defaults to 'mock' (first run, unknown value, or an
 *  unreadable store must never strand the app on a sign-in wall). */
export async function getSavedMode(): Promise<DataMode> {
  try {
    const v = await SecureStore.getItemAsync(MODE_KEY);
    return v === 'live' ? 'live' : 'mock';
  } catch {
    return 'mock';
  }
}

export async function setSavedMode(mode: DataMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}
