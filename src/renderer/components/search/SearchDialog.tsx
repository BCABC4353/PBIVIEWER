import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  Input,
  Text,
  Spinner,
} from '@fluentui/react-components';
import {
  SearchRegular,
  DocumentRegular,
  BoardRegular,
  AppsRegular,
  FolderRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useSearchStore } from '../../stores/search-store';
import { useContentStore } from '../../stores/content-store';

const LISTBOX_ID = 'search-results-listbox';

export const SearchDialog: React.FC = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    isOpen,
    query,
    results,
    isSearching,
    partialFailureWarning,
    closeSearch,
    setQuery,
    search,
  } = useSearchStore();

  const { recordItemOpened } = useContentStore();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        search(query);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, search]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleNavigate = useCallback((result: typeof results[0]) => {
    closeSearch();

    // Record usage for reports and dashboards. recordItemOpened is
    // fire-and-forget — do NOT await it; the navigate() below must fire
    // synchronously so the user sees instant feedback.
    if ((result.type === 'report' || result.type === 'dashboard') && result.workspaceId) {
      recordItemOpened({
        id: result.id,
        name: result.name,
        type: result.type,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName || 'Unknown',
      });
    }

    switch (result.type) {
      case 'report':
        if (result.workspaceId) {
          navigate(`/report/${result.workspaceId}/${result.id}`);
        }
        break;
      case 'dashboard':
        if (result.workspaceId) {
          navigate(`/dashboard/${result.workspaceId}/${result.id}`);
        }
        break;
      case 'app':
        navigate(`/app/${result.id}`);
        break;
      case 'workspace':
        // Navigate to workspaces page with expand param to auto-open this workspace
        navigate(`/workspaces?expand=${result.id}`);
        break;
    }
  }, [closeSearch, navigate, recordItemOpened]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleNavigate(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeSearch();
        break;
    }
  }, [results, selectedIndex, handleNavigate, closeSearch]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'report':
        return <DocumentRegular className="text-brand-primary" />;
      case 'dashboard':
        return <BoardRegular className="text-status-success" />;
      case 'app':
        return <AppsRegular className="text-purple-600" />;
      case 'workspace':
        return <FolderRegular className="text-amber-600" />;
      default:
        return <DocumentRegular />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'report':
        return 'Report';
      case 'dashboard':
        return 'Dashboard';
      case 'app':
        return 'App';
      case 'workspace':
        return 'Workspace';
      default:
        return type;
    }
  };

  const hasResults = results.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => !data.open && closeSearch()}>
      <DialogSurface className="p-0 max-w-2xl w-full">
        {/* Screen-reader-only dialog title for accessibility */}
        <DialogTitle>
          <span className="sr-only">Search Power BI content</span>
        </DialogTitle>

        {/* Search input — ARIA combobox attributes land on the inner <input> via the
            Fluent Input slot override so AT announces the correct role and state. */}
        <div className="p-4 border-b border-neutral-stroke-2">
          <Input
            ref={inputRef}
            contentBefore={<SearchRegular />}
            contentAfter={
              query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 hover:bg-neutral-background-3 rounded"
                  aria-label="Clear search"
                >
                  <DismissRegular className="text-sm" />
                </button>
              )
            }
            placeholder="Search reports, dashboards, apps, and workspaces..."
            value={query}
            onChange={(_, data) => setQuery(data.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search Power BI content"
            className="w-full"
            size="large"
            input={{
              role: 'combobox',
              'aria-expanded': hasResults,
              'aria-controls': hasResults ? LISTBOX_ID : undefined,
              'aria-activedescendant': hasResults
                ? `search-result-${selectedIndex}`
                : undefined,
            }}
          />
        </div>

        {/* Partial-failure warning (non-blocking) */}
        {partialFailureWarning && (
          <div
            role="status"
            aria-live="polite"
            className="px-4 py-2 border-b border-neutral-stroke-2 bg-status-warning/10"
          >
            <Text size={200} className="text-status-warning">
              {partialFailureWarning}
            </Text>
          </div>
        )}

        {/* Results */}
        <div className="max-h-96 overflow-auto">
          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="small" />
              <Text className="ml-2 text-neutral-foreground-2">Searching...</Text>
            </div>
          )}

          {!isSearching && query && results.length === 0 && (
            <div
              role="status"
              aria-live="polite"
              className="py-8 text-center text-neutral-foreground-3"
            >
              <Text>No results found for "{query}"</Text>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div
              id={LISTBOX_ID}
              className="py-2"
              role="listbox"
              aria-label="Search results"
            >
              {results.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-label={`Open ${getTypeLabel(result.type).toLowerCase()} ${result.name}${result.workspaceName ? ` in workspace ${result.workspaceName}` : ''}`}
                  className={`px-4 py-3 cursor-pointer flex items-center gap-3 ${
                    index === selectedIndex
                      ? 'bg-neutral-background-3'
                      : 'hover:bg-neutral-background-2'
                  }`}
                  onClick={() => handleNavigate(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex-shrink-0">
                    {getIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Text weight="semibold" className="block truncate">
                      {result.name}
                    </Text>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Text size={200} className="text-neutral-foreground-3">
                        {getTypeLabel(result.type)}
                      </Text>
                      {result.workspaceName && (
                        <>
                          <span className="text-neutral-foreground-4">•</span>
                          <Text size={200} className="text-neutral-foreground-3 truncate">
                            {result.workspaceName}
                          </Text>
                        </>
                      )}
                      {result.description && (
                        <>
                          <span className="text-neutral-foreground-4">•</span>
                          <Text size={200} className="text-neutral-foreground-3 truncate">
                            {result.description}
                          </Text>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-neutral-foreground-3">
              <Text>Start typing to search...</Text>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-neutral-stroke-2 bg-neutral-background-2 flex items-center justify-between text-xs text-neutral-foreground-3">
          <div className="flex items-center gap-4">
            <span><kbd className="kbd-hint">↑↓</kbd> Navigate</span>
            <span><kbd className="kbd-hint">↵</kbd> Open</span>
            <span><kbd className="kbd-hint">Esc</kbd> Close</span>
          </div>
        </div>
      </DialogSurface>
    </Dialog>
  );
};

export default SearchDialog;
