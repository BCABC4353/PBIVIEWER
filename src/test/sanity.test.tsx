import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test harness sanity', () => {
  it('jsdom + window.electronAPI mock available', () => {
    // setup.ts installs createElectronAPIMock() before each test. Confirm at
    // least one method is the vi.fn the setup file builds — if any other code
    // path replaced it with a plain function, this regression catches it.
    expect(window.electronAPI).toBeDefined();
    expect(window.electronAPI.auth.getUser).toBeDefined();
    // vi.fn() is detectable via `.mock` on the function instance.
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
