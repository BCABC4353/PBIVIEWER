import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test harness sanity', () => {
  it('jsdom + window.electronAPI mock available', () => {
    expect(window.electronAPI).toBeDefined();
    expect(window.electronAPI.auth.getUser).toBeDefined();
    expect(vi.isMockFunction(window.electronAPI.auth.getUser)).toBe(true);
  });

  it('renders a trivial React tree through React Testing Library (jsdom wired)', () => {
    render(<div data-testid="greeting">hello</div>);
    expect(screen.getByTestId('greeting').textContent).toBe('hello');
  });

  it('window.matchMedia is stubbed (Fluent UI compat)', () => {
    expect(typeof window.matchMedia).toBe('function');
    const result = window.matchMedia('(prefers-color-scheme: dark)');
    expect(result.matches).toBe(false);
  });
});
