import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './search-store';

// Snapshot the initial slice we care about so each test starts clean.
// Zustand's `create` doesn't expose getInitialState in v4, so we reset by
// hand to the documented defaults from search-store.ts.
const INITIAL_STATE = {
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,
  error: null,
  partialFailureWarning: null,
};

beforeEach(() => {
  // Preserve action references — merge our defaults on top of current state.
  useSearchStore.setState(INITIAL_STATE);
});

describe('useSearchStore — closeSearch', () => {
  it('clears results, query, and isOpen', () => {
    // Seed the store with some non-default state.
    useSearchStore.setState({
      isOpen: true,
      query: 'foo',
      results: [
        { id: '1', name: 'Foo Report', type: 'report' },
      ],
      isSearching: true,
    });

    useSearchStore.getState().closeSearch();

    const state = useSearchStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
  });

  it('does not throw when called repeatedly (multiple generation bumps)', () => {
    const { closeSearch, clearResults } = useSearchStore.getState();
    expect(() => {
      closeSearch();
      clearResults();
      closeSearch();
      clearResults();
    }).not.toThrow();
  });
});

describe('useSearchStore — clearResults', () => {
  it('clears results and query without flipping isOpen', () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'bar',
      results: [{ id: '2', name: 'Bar', type: 'workspace' }],
    });

    useSearchStore.getState().clearResults();

    const state = useSearchStore.getState();
    expect(state.results).toEqual([]);
    expect(state.query).toBe('');
    // closeSearch flips isOpen, clearResults does not.
    expect(state.isOpen).toBe(true);
  });
});

describe('useSearchStore — invalidateAll', () => {
  it('resets results, query, error, and partialFailureWarning', () => {
    useSearchStore.setState({
      query: 'leftover',
      results: [{ id: '3', name: 'Stale', type: 'dashboard' }],
      error: 'previous error',
      partialFailureWarning: 'Some workspaces could not be loaded: A, B',
    });

    useSearchStore.getState().invalidateAll();

    const state = useSearchStore.getState();
    expect(state.results).toEqual([]);
    expect(state.query).toBe('');
    expect(state.error).toBeNull();
    expect(state.partialFailureWarning).toBeNull();
  });
});

describe('useSearchStore — open/close cycle smoke test', () => {
  it('openSearch sets isOpen true; closeSearch tears it down cleanly', () => {
    const { openSearch, closeSearch } = useSearchStore.getState();
    openSearch();
    expect(useSearchStore.getState().isOpen).toBe(true);
    closeSearch();
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('setQuery with empty string clears stale results', () => {
    useSearchStore.setState({
      query: 'previous',
      results: [{ id: '4', name: 'Stale', type: 'app' }],
      isSearching: true,
    });
    useSearchStore.getState().setQuery('');
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
  });
});
