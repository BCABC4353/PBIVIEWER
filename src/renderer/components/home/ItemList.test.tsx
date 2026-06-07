import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemList } from './ItemList';
import type { ContentItem } from '../../../shared/types';

const mockItems: ContentItem[] = [
  {
    id: 'report-1',
    name: 'Sales Report',
    type: 'report',
    workspaceId: 'ws-1',
    workspaceName: 'Finance',
  },
  {
    id: 'dashboard-1',
    name: 'KPI Dashboard',
    type: 'dashboard',
    workspaceId: 'ws-1',
    workspaceName: 'Finance',
  },
];

describe('ItemList — keyboard activation (A11Y-B5)', () => {
  it('calls onOpen when Enter is pressed on a row', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    // The first data row contains the first item's name
    const rows = screen.getAllByRole('row');
    // rows[0] is the header row; rows[1] is the first data row
    const firstDataRow = rows[1]!;
    fireEvent.keyDown(firstDataRow, { key: 'Enter', code: 'Enter' });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(mockItems[0]);
  });

  it('calls onOpen when Space is pressed on a row', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1]!;
    fireEvent.keyDown(firstDataRow, { key: ' ', code: 'Space' });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(mockItems[0]);
  });

  it('does NOT call onOpen when an unrelated key is pressed on a row', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1]!;
    fireEvent.keyDown(firstDataRow, { key: 'Tab', code: 'Tab' });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onOpen when a row is clicked', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]!);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(mockItems[0]);
  });

  it('rows are focusable (tabIndex=0)', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1]!;
    expect(firstDataRow.getAttribute('tabindex')).toBe('0');
  });

  it('kebab keydown does NOT propagate to open the row', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const firstItem = mockItems[0]!;
    const kebab = screen.getAllByRole('button', {
      name: `More options for ${firstItem.name}`,
    })[0]!;
    // The inner div wrapping the kebab calls e.stopPropagation() on keydown
    fireEvent.keyDown(kebab, { key: 'Enter', code: 'Enter' });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('kebab click does NOT propagate to open the row', () => {
    const onOpen = vi.fn();
    render(<ItemList items={mockItems} onOpen={onOpen} />);

    const firstItem = mockItems[0]!;
    const kebab = screen.getAllByRole('button', {
      name: `More options for ${firstItem.name}`,
    })[0]!;
    // The inner div wrapping the kebab calls e.stopPropagation() on click
    fireEvent.click(kebab);

    expect(onOpen).not.toHaveBeenCalled();
  });
});
