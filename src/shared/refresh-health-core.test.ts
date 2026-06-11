import { describe, it, expect } from 'vitest';
import { deriveScheduleInfo } from './refresh-health-core';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-06-11T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function everyThirtyMinutes(): { enabled: boolean; days: string[]; times: string[] } {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
  }
  return { enabled: true, days: [], times };
}

describe('deriveScheduleInfo', () => {
  it('returns empty info when the schedule is missing or disabled', () => {
    expect(deriveScheduleInfo(null)).toEqual({});
    expect(deriveScheduleInfo(undefined)).toEqual({});
    expect(
      deriveScheduleInfo({ enabled: false, days: ['Monday'], times: ['06:00'] }, isoAgo(HOUR_MS), NOW),
    ).toEqual({});
  });

  it('summarises the configured days and times', () => {
    const result = deriveScheduleInfo(
      { enabled: true, days: ['Monday', 'Tuesday'], times: ['06:00'] },
      isoAgo(HOUR_MS),
      NOW,
    );
    expect(result.scheduleSummary).toBe('Monday, Tuesday at 06:00');
    expect(result.scheduleOverdue).toBe(false);
  });

  it('flags overdue when the dataset has never refreshed successfully', () => {
    const result = deriveScheduleInfo({ enabled: true, days: [], times: ['06:00'] }, undefined, NOW);
    expect(result.scheduleOverdue).toBe(true);
  });

  it('keeps the default 24h floor so existing callers are unchanged', () => {
    const result = deriveScheduleInfo(everyThirtyMinutes(), isoAgo(6 * HOUR_MS), NOW);
    expect(result.scheduleOverdue).toBe(false);
  });

  it('honours a caller-supplied floor for cadence-aware overdue detection', () => {
    const behind = deriveScheduleInfo(everyThirtyMinutes(), isoAgo(6 * HOUR_MS), NOW, 2 * HOUR_MS);
    expect(behind.scheduleOverdue).toBe(true);

    const fresh = deriveScheduleInfo(everyThirtyMinutes(), isoAgo(HOUR_MS), NOW, 2 * HOUR_MS);
    expect(fresh.scheduleOverdue).toBe(false);
  });

  it('still respects twice the expected gap for sparse schedules even with a small floor', () => {
    const weekly = { enabled: true, days: ['Monday'], times: ['06:00'] };
    const result = deriveScheduleInfo(weekly, isoAgo(8 * 24 * HOUR_MS), NOW, 2 * HOUR_MS);
    expect(result.scheduleOverdue).toBe(false);

    const longGone = deriveScheduleInfo(weekly, isoAgo(15 * 24 * HOUR_MS), NOW, 2 * HOUR_MS);
    expect(longGone.scheduleOverdue).toBe(true);
  });
});
