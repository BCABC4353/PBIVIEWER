/**
 * safe-store — SecureStore on device, localStorage in the browser.
 *
 * expo-secure-store has no web implementation (its calls reject), so the
 * desktop-browser preview ("press W in the dev terminal") would break sign-in
 * persistence and the data-mode flag. On web we fall back to localStorage:
 * fine for the persisted mode flag; acceptable for tokens ONLY because the
 * web target is a preview/dev surface, not a shipped client. Native builds
 * keep hardware-backed storage exactly as before.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function webStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : null;
  } catch {
    return null; // privacy mode can throw on access
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webStorage()?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
