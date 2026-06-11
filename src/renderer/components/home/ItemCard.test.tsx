import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemCard } from './ItemCard';
import type { ContentItem } from '../../../shared/types';

const mockItem: ContentItem = {
  id: 'test-report-1',
  name: 'Sales Report',
  type: 'report',
  workspaceId: 'ws-1',
  workspaceName: 'Finance',
};

describe('ItemCard — keyboard activation (A11Y-B5)', () => {
  it('calls onOpen when Enter is pressed on the card', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: `Open ${mockItem.name}` });
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(mockItem);
  });

  it('calls onOpen when Space is pressed on the card', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: `Open ${mockItem.name}` });
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(mockItem);
  });

  it('does NOT call onOpen when an unrelated key is pressed on the card', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: `Open ${mockItem.name}` });
    fireEvent.keyDown(card, { key: 'Tab', code: 'Tab' });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('card is focusable (tabIndex=0)', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: `Open ${mockItem.name}` });
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('kebab button has an accessible aria-label', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const kebab = screen.getByRole('button', {
      name: `More options for ${mockItem.name}`,
    });
    expect(kebab).toBeDefined();
  });

  it('pressing Enter on the kebab button does NOT propagate to activate the card', () => {
    const onOpen = vi.fn();
    render(<ItemCard item={mockItem} onOpen={onOpen} />);

    const kebab = screen.getByRole('button', {
      name: `More options for ${mockItem.name}`,
    });
    fireEvent.keyDown(kebab, { key: 'Enter', code: 'Enter' });

    expect(onOpen).not.toHaveBeenCalled();
  });
});
