
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useContentStore } from '../stores/content-store';
import { useSearchStore } from '../stores/search-store';
import { initEvictOnLogout } from './evict-on-logout';


function seedAuthAuthenticated(): void {
  useAuthStore.setState({ isAuthenticated: true, user: null, isLoading: false, error: null });
}

function seedAuthAuthenticatedAs(id: string): void {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id, displayName: 'User ' + id, email: id + '@example.com' },
    isLoading: false,
    error: null,
  });
}

function seedAuthSignedOut(): void {
  useAuthStore.setState({ isAuthenticated: false, user: null, isLoading: false, error: null });
}

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


describe('initEvictOnLogout', () => {
  it('evicts content and search when auth transitions true → false', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

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
    cleanup();

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
    useAuthStore.setState({ error: 'post-logout error', isAuthenticated: false });
    useAuthStore.setState({ isLoading: false, isAuthenticated: false });

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('evicts when the identity changes between two authenticated states (A → B)', () => {
    seedAuthAuthenticatedAs('acct-A');
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    seedAuthAuthenticatedAs('acct-B');

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('evicts when switching back to a previously-seen identity (B → A)', () => {
    seedAuthAuthenticatedAs('acct-B');
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    seedAuthAuthenticatedAs('acct-A');

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('does NOT evict on login (no identity → A)', () => {
    seedAuthSignedOut();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    seedAuthAuthenticatedAs('acct-A');

    expect(contentReset).not.toHaveBeenCalled();
    expect(searchInvalidate).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT evict when an authenticated update keeps the same identity', () => {
    seedAuthAuthenticatedAs('acct-A');
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup = initEvictOnLogout();

    useAuthStore.setState({ isLoading: true });
    useAuthStore.setState({ error: 'transient' });

    expect(contentReset).not.toHaveBeenCalled();
    expect(searchInvalidate).not.toHaveBeenCalled();

    cleanup();
  });

  it('handles StrictMode double-invoke (init → cleanup → init)', () => {
    seedAuthAuthenticated();
    const contentReset = spyOnContentReset();
    const searchInvalidate = spyOnSearchInvalidateAll();

    const cleanup1 = initEvictOnLogout();
    cleanup1();

    const cleanup2 = initEvictOnLogout();

    useAuthStore.setState({ isAuthenticated: false });

    expect(contentReset).toHaveBeenCalledTimes(1);
    expect(searchInvalidate).toHaveBeenCalledTimes(1);

    cleanup2();
  });
});
