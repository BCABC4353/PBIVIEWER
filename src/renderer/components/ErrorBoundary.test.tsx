import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('../lib/report-issue', () => ({ reportIssue: vi.fn() }));

let shouldThrow = true;
const Boom: React.FC = () => {
  if (shouldThrow) throw new Error('PHI: ICU Census Ward 4B blew up');
  return <div>recovered content</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the fallback on a child crash and does NOT leak the raw error message in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(/ICU Census Ward 4B/)).toBeNull();
    process.env.NODE_ENV = prev;
  });

  it('auto-retries an unattended crash and recovers once the child stops throwing', () => {
    vi.useFakeTimers();
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    shouldThrow = false;
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText('recovered content')).toBeTruthy();
  });
});
