import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ViewerToolbar } from './ViewerToolbar';
import { formatAbsoluteDateTime } from '../../lib/date-format';

const HOUR_MS = 60 * 60 * 1000;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function chipOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-freshness-chip]');
}

describe('ViewerToolbar freshness chip', () => {
  it('renders a healthy chip with glyph and relative age', () => {
    const { container } = render(
      <ViewerToolbar onBack={vi.fn()} showFreshness lastDataRefresh={isoAgo(4 * 60 * 1000)} />,
    );
    const chip = chipOf(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('●');
    expect(chip!.textContent).toMatch(/Updated \d+ min ago/);
  });

  it('renders a warning chip when the 24h fallback trips', () => {
    const { container } = render(
      <ViewerToolbar onBack={vi.fn()} showFreshness lastDataRefresh={isoAgo(26 * HOUR_MS)} />,
    );
    const chip = chipOf(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('▲');
    expect(chip!.textContent).toMatch(/Stale — 26 hours old/);
  });

  it('renders a behind-schedule chip when scheduleOverdue is set even if the data is under 24h old', () => {
    const { container } = render(
      <ViewerToolbar
        onBack={vi.fn()}
        showFreshness
        lastDataRefresh={isoAgo(6 * HOUR_MS)}
        scheduleOverdue
        scheduleSummary="Daily at 06:00, 12:00"
      />,
    );
    const chip = chipOf(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('▲');
    expect(chip!.textContent).toContain('Behind schedule (Daily at 06:00, 12:00)');
  });

  it('warns on schedule alone when no refresh timestamp is known yet', () => {
    const { container } = render(
      <ViewerToolbar onBack={vi.fn()} showFreshness lastDataRefresh={null} scheduleOverdue />,
    );
    const chip = chipOf(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('Behind schedule');
  });

  it('keeps the absolute timestamp and owner diagnostic in the hover tooltip', () => {
    const iso = isoAgo(4 * 60 * 1000);
    const { container } = render(
      <ViewerToolbar
        onBack={vi.fn()}
        showFreshness
        lastDataRefresh={iso}
        freshnessDiagnostic="mode: report (api lookup)"
      />,
    );
    const title = chipOf(container)?.getAttribute('title') ?? '';
    expect(title).toContain(`Data refreshed: ${formatAbsoluteDateTime(iso)}`);
    expect(title).toContain('mode: report (api lookup)');
  });

  it('uses the provided freshness label for aggregate surfaces', () => {
    const { container } = render(
      <ViewerToolbar
        onBack={vi.fn()}
        showFreshness
        lastDataRefresh={isoAgo(4 * 60 * 1000)}
        freshnessLabel="Oldest data"
      />,
    );
    const chip = chipOf(container);
    expect(chip!.textContent).toMatch(/Oldest data \d+ min ago/);
    expect(chip!.getAttribute('title')).toContain('Oldest data:');
  });

  it('shows the quiet placeholder when freshness is not yet known', () => {
    const { container } = render(<ViewerToolbar onBack={vi.fn()} showFreshness />);
    expect(chipOf(container)).toBeNull();
    const strip = container.querySelector('[data-freshness-strip]');
    expect(strip?.textContent).toContain('Data refreshed: —');
  });
});

describe('ViewerToolbar draw toggle', () => {
  it('is hidden when no onAnnotate handler is provided', () => {
    const { container } = render(<ViewerToolbar onBack={vi.fn()} />);
    expect(container.querySelector('[data-annotate-toggle]')).toBeNull();
  });

  it('renders and fires the handler when provided', () => {
    const onAnnotate = vi.fn();
    const { container } = render(
      <ViewerToolbar onBack={vi.fn()} onAnnotate={onAnnotate} />,
    );
    const toggle = container.querySelector('[data-annotate-toggle]') as HTMLElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(onAnnotate).toHaveBeenCalledTimes(1);
  });

  it('reflects the active drawing state', () => {
    const { container } = render(
      <ViewerToolbar onBack={vi.fn()} onAnnotate={vi.fn()} isAnnotating />,
    );
    const toggle = container.querySelector('[data-annotate-toggle]') as HTMLElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('title')).toBe('Stop drawing');
  });
});
