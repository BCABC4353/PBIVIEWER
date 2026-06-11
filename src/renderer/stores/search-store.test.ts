import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSearchStore } from './search-store';

const INITIAL_STATE = {
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,
  error: null,
  partialFailureWarning: null,
};

beforeEach(() => {
  useSearchStore.setState(INITIAL_STATE);
});

describe('useSearchStore — closeSearch', () => {
  it('clears results, query, error, and isOpen', () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'foo',
      results: [
        { id: '1', name: 'Foo Report', type: 'report' },
      ],
      isSearching: true,
      error: 'Search failed. Check your connection and try again.',
    });

    useSearchStore.getState().closeSearch();

    const state = useSearchStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
    expect(state.error).toBeNull();
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
      error: 'Search failed. Check your connection and try again.',
    });
    useSearchStore.getState().setQuery('');
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
    expect(state.error).toBeNull();
  });
});

describe('useSearchStore — search failure handling', () => {
  beforeEach(() => {
    useSearchStore.getState().invalidateCache();
  });

  it('surfaces a user-presentable error when the search fetch rejects', async () => {
    vi.mocked(window.electronAPI.content.getWorkspaces).mockRejectedValue(
      new Error('network down'),
    );

    await useSearchStore.getState().search('sales');

    const state = useSearchStore.getState();
    expect(state.error).toBe('Search failed. Check your connection and try again.');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
  });

  it('surfaces the IPC userMessage when every endpoint reports failure', async () => {
    const failure = {
      success: false as const,
      error: { code: 'AUTH', message: 'raw detail', userMessage: 'Please sign in again.' },
    };
    vi.mocked(window.electronAPI.content.getWorkspaces).mockResolvedValue(failure);
    vi.mocked(window.electronAPI.content.getApps).mockResolvedValue(failure);
    vi.mocked(window.electronAPI.content.getAllItems).mockResolvedValue(failure);

    await useSearchStore.getState().search('sales');

    const state = useSearchStore.getState();
    expect(state.error).toBe('Please sign in again.');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
  });

  it('does not cache a failure — a retry re-fetches and a success clears the error', async () => {
    vi.mocked(window.electronAPI.content.getWorkspaces).mockRejectedValueOnce(
      new Error('network down'),
    );

    await useSearchStore.getState().search('sales');

    expect(useSearchStore.getState().error).toBe(
      'Search failed. Check your connection and try again.',
    );
    expect(window.electronAPI.content.getWorkspaces).toHaveBeenCalledTimes(1);

    vi.mocked(window.electronAPI.content.getWorkspaces).mockResolvedValueOnce({
      success: true,
      data: [{ id: 'ws-1', name: 'Sales Workspace', isReadOnly: false, type: 'Workspace' }],
    });

    await useSearchStore.getState().search('sales');

    const state = useSearchStore.getState();
    expect(window.electronAPI.content.getWorkspaces).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(state.results).toEqual([
      { id: 'ws-1', name: 'Sales Workspace', type: 'workspace' },
    ]);
  });

  it('starting a new search clears a previously surfaced error', async () => {
    useSearchStore.setState({ error: 'Search failed. Check your connection and try again.' });

    await useSearchStore.getState().search('sales');

    expect(useSearchStore.getState().error).toBeNull();
  });
});
