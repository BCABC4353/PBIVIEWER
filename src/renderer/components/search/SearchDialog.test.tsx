
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SearchDialog } from './SearchDialog';
import { useSearchStore } from '../../stores/search-store';

const results = [
  {
    id: 'r-1',
    name: 'Sales Report',
    type: 'report' as const,
    workspaceId: 'ws-1',
    workspaceName: 'Finance',
  },
  {
    id: 'r-2',
    name: 'Sales Dashboard',
    type: 'dashboard' as const,
    workspaceId: 'ws-1',
    workspaceName: 'Finance',
  },
];

function renderOpenDialog() {
  useSearchStore.setState({
    isOpen: true,
    query: 'sales',
    results,
    isSearching: false,
    error: null,
    partialFailureWarning: null,
  });
  return render(
    <MemoryRouter>
      <SearchDialog />
    </MemoryRouter>,
  );
}

describe('SearchDialog — UX-13 Escape must not leak to global handlers', () => {
  beforeEach(() => {
    cleanup();
  });

  it('Escape closes the search and stops propagation to window listeners', () => {
    renderOpenDialog();
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);

    const input = screen.getByRole('combobox', { name: 'Search Power BI content' });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useSearchStore.getState().isOpen).toBe(false);
    expect(windowKeydown).not.toHaveBeenCalled();

    window.removeEventListener('keydown', windowKeydown);
  });

  it('other keys still propagate normally', () => {
    renderOpenDialog();
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);

    const input = screen.getByRole('combobox', { name: 'Search Power BI content' });
    fireEvent.keyDown(input, { key: 'a' });

    expect(windowKeydown).toHaveBeenCalledTimes(1);

    window.removeEventListener('keydown', windowKeydown);
  });
});

describe('SearchDialog — UX-7 selected result scrolls into view', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('scrolls the newly selected option into view on ArrowDown', () => {
    renderOpenDialog();
    const scrollSpy = vi.mocked(Element.prototype.scrollIntoView);
    scrollSpy.mockClear();

    const input = screen.getByRole('combobox', { name: 'Search Power BI content' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const second = screen.getByRole('option', { name: /Sales Dashboard/ });
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
