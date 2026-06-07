/**
 * ARCH-B3: unit tests for evict-on-logout subscription wiring.
 *
 * Verifies:
 *   - content.reset() and search.invalidateAll() fire on a true→false
 *     isAuthenticated transition.
 *   - No eviction fires when signing *in* (false→true) or on unrelated updates.
 *   - The cleanup function unsubscribes; no eviction fires after cleanup.
 *   - Double-invoke (React StrictMode: init → cleanup → init) works correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useContentStore } from '../stores/content-store';
import { useSearchStore } from '../stores/search-store';
import { initEvictOnLogout } from './evict-on-logout';

// ---------------------------------------------------------------------------
// Helpers — seed initial store states each test starts clean
// ---------------------------------------------------------------------------

function seedAuthAuthenticated(): void {
  useAuthStore.setState({ isAuthenticated: true, user: null, isLoading: false, error: null });
}

function seedAuthSignedOut(): void {
  useAuthStore.setState({ isAuthenticated: false, user: null, isLoading: false, error: null });
}

// ---------------------------------------------------------------------------
// Reset Zustand stores to clean defaults before each test.
// The search store holds module-level cache; invalidateAll wipes it.
// ---------------------------------------------------------------------------
beforeEach(() => {
  seedAuthSignedOut();
  useContentStore.setState({
    workspaces: [],
    reports: new Map(),
    dashboards: new Map(),
    apps: [],
    recentItems: [],
    frequentItems: [],
    isLoading: false,
    error: null,
  });
  useSearchStore.setState({
    isOpen: false,
    query: '',
    results: [],
    isSearching: false,
    error: null,
    partialFailureWarning: null,
  });
});

// ---------------------------------------------------------------------------
// Spy helpers — patch store action refs so we can count invocations.
// ---------------------------------------------------------------------------

function spyOnContentReset() {
  const spy = vi.fn();
  useContentStore.setState({ reset: spy } as Partial<ReturnType<typeof useContentStore.getState>>);
  return spy;
}

function spyOnSearchInvalidateAll() {
  const spy = vi.fn();
  useSearchStore.setState({ invalidateAll: spy } as Partial<ReturnType<typeof useSearchStore.getState>>);
  return spy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initEvictOnLogout', () => {
  it('evicts content and search when auth transitions true → false', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    // Simulate logout
    useAuthStore.setState({ isAuthenticated: false });

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('does NOT evict when auth transitions false → true (login)', () => {
    seedAuthSignedOut();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    // Simulate login
    useAuthStore.setState({ isAuthenticated: true });

    expect(contentReset).not.toHaveBeenCalled();
    expect(searchInvalidate).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT evict on unrelated state updates when already signed out', () => {
    seedAuthSignedOut();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    // Unrelated update — error message changes but auth stays signed-out
    useAuthStore.setState({ error: 'some error', isAuthenticated: false });

    expect(contentReset).not.toHaveBeenCalled();
    expect(searchInvalidate).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT evict after cleanup() is called', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();
    cleanup(); // unsubscribe immediately

    // This transition would have fired eviction if still subscribed
    useAuthStore.setState({ isAuthenticated: false });

    expect(contentReset).not.toHaveBeenCalled();
    expect(searchInvalidate).not.toHaveBeenCalled();
  });

  it('evicts only once per logout even when multiple state changes follow', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    useAuthStore.setState({ isAuthenticated: false });
    // Additional updates after already signed-out should not re-fire.
    useAuthStore.setState({ error: 'post-logout error', isAuthenticated: false });
    useAuthStore.setState({ isLoading: false, isAuthenticated: false });

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('handles StrictMode double-invoke (init → cleanup → init)', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    // First mount
    const cleanup1 = initEvictOnLogout();
    cleanup1(); // Strict Mode unmounts first render

    // Second mount (Strict Mode re-mount)
    const cleanup2 = initEvictOnLogout();

    useAuthStore.setState({ isAuthenticated: false });

    // Only the active (second) subscription should fire, and exactly once.
    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup2();
  });
});
