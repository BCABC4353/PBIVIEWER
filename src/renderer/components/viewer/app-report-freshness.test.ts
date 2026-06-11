
import { describe, it, expect } from 'vitest';

import {
  parseReportIdFromUrl,
  selectFreshnessTarget,
  type AppReportFreshnessInfo,
  type DatasetWorkspacePair,
} from './app-report-freshness';

const APP_ID = '11111111-2222-3333-4444-555555555555';
const REPORT_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const REPORT_B = '99999999-8888-7777-6666-555555555555';

describe('parseReportIdFromUrl', () => {
  it('extracts the reportId from an app report URL with a ReportSection suffix', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${REPORT_A}/ReportSection1234abcd?experience=power-bi`,
      ),
    ).toBe(REPORT_A);
  });

  it('extracts the reportId when the URL ends at the reportId (no page segment)', () => {
    expect(
      parseReportIdFromUrl(`https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${REPORT_B}`),
    ).toBe(REPORT_B);
  });

  it('lowercases an uppercase GUID so lookups match the API-cased report list', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${REPORT_A.toUpperCase()}/ReportSection2`,
      ),
    ).toBe(REPORT_A);
  });

  it('returns null for the app home URL (no report on screen)', () => {
    expect(parseReportIdFromUrl(`https://app.powerbi.com/groups/me/apps/${APP_ID}`)).toBeNull();
  });

  it('returns null for an app dashboard URL', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/dashboards/${REPORT_B}`,
      ),
    ).toBeNull();
  });

  it('returns null for about:blank, null, undefined, and empty string', () => {
    expect(parseReportIdFromUrl('about:blank')).toBeNull();
    expect(parseReportIdFromUrl(null)).toBeNull();
    expect(parseReportIdFromUrl(undefined)).toBeNull();
    expect(parseReportIdFromUrl('')).toBeNull();
  });

  it('returns null when the /reports/ segment is not a 36-char GUID', () => {
    expect(
      parseReportIdFromUrl(`https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/notaguid`),
    ).toBeNull();
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${REPORT_A}f/ReportSection1`,
      ),
    ).toBeNull();
  });

  it('requires the real 8-4-4-4-12 GUID shape, not any 36-char hex/dash run', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${'-'.repeat(36)}/x`,
      ),
    ).toBeNull();
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${'a'.repeat(36)}/x`,
      ),
    ).toBeNull();
  });

  it('extracts the reportId from a paginated /rdlreports/ app URL', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/rdlreports/${REPORT_A}?experience=power-bi`,
      ),
    ).toBe(REPORT_A);
  });

  it('extracts the reportId from a ?reportId= query form (reportEmbed-style routes)', () => {
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/reportEmbed?reportId=${REPORT_B}&appId=${APP_ID}`,
      ),
    ).toBe(REPORT_B);
    expect(
      parseReportIdFromUrl(`https://app.powerbi.com/view?x=1&reportId=${REPORT_B.toUpperCase()}`),
    ).toBe(REPORT_B);
  });
});

describe('selectFreshnessTarget', () => {
  const reports: AppReportFreshnessInfo[] = [
    { id: REPORT_A, name: 'WORKFLOWS', datasetId: 'ds-workflows', workspaceId: 'ws-1' },
    { id: REPORT_B, name: 'BILLING REPORTS', datasetId: 'ds-billing', workspaceId: 'ws-2' },
    { id: 'cccccccc-0000-0000-0000-000000000000', name: 'No Dataset', datasetId: '', workspaceId: 'ws-1' },
  ];
  const aggregate: DatasetWorkspacePair[] = [
    { datasetId: 'ds-workflows', workspaceId: 'ws-1' },
    { datasetId: 'ds-billing', workspaceId: 'ws-2' },
  ];

  it('targets the ONE dataset of the viewed report (single-dataset getDataFreshness args)', () => {
    expect(selectFreshnessTarget(REPORT_A, reports, aggregate)).toEqual({
      mode: 'report',
      datasets: [{ datasetId: 'ds-workflows', workspaceId: 'ws-1' }],
    });
  });

  it('switching reports switches the targeted dataset (per-report stamps, like Power BI)', () => {
    expect(selectFreshnessTarget(REPORT_B, reports, aggregate)).toEqual({
      mode: 'report',
      datasets: [{ datasetId: 'ds-billing', workspaceId: 'ws-2' }],
    });
  });

  it('matches by originalReportObjectId too — app URLs can name the source-workspace twin', () => {
    const original = 'feedfeed-0000-4444-8888-deadbeef0001';
    const withOriginal: AppReportFreshnessInfo[] = [
      { ...reports[0]!, originalReportObjectId: original },
      reports[1]!,
    ];
    expect(selectFreshnessTarget(original, withOriginal, aggregate)).toEqual({
      mode: 'report',
      datasets: [{ datasetId: 'ds-workflows', workspaceId: 'ws-1' }],
    });
    expect(selectFreshnessTarget(original.toUpperCase(), withOriginal, aggregate).mode).toBe(
      'report',
    );
  });

  it('matches report ids case-insensitively', () => {
    const upperCasedList = reports.map((r) => ({ ...r, id: r.id.toUpperCase() }));
    expect(selectFreshnessTarget(REPORT_A, upperCasedList, aggregate).mode).toBe('report');
    expect(selectFreshnessTarget(REPORT_A.toUpperCase(), reports, aggregate).mode).toBe('report');
  });

  it('falls back to the aggregate when no report is in the URL (app home)', () => {
    expect(selectFreshnessTarget(null, reports, aggregate)).toEqual({
      mode: 'aggregate',
      datasets: aggregate,
    });
  });

  it('falls back to the aggregate for a reportId not in the app report list — and flags it unresolved', () => {
    const target = selectFreshnessTarget('deadbeef-dead-beef-dead-beefdeadbeef', reports, aggregate);
    expect(target.mode).toBe('aggregate');
    expect(target.datasets).toEqual(aggregate);
    expect(target.unresolvedReportId).toBe('deadbeef-dead-beef-dead-beefdeadbeef');
  });

  it('falls back to the aggregate when the viewed report has no datasetId — and flags it unresolved', () => {
    const target = selectFreshnessTarget('cccccccc-0000-0000-0000-000000000000', reports, aggregate);
    expect(target.mode).toBe('aggregate');
    expect(target.datasets).toEqual(aggregate);
    expect(target.unresolvedReportId).toBe('cccccccc-0000-0000-0000-000000000000');
  });

  it('lowercases the unresolved id so resolver cache keys are stable', () => {
    const target = selectFreshnessTarget(
      'DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF',
      reports,
      aggregate,
    );
    expect(target.unresolvedReportId).toBe('deadbeef-dead-beef-dead-beefdeadbeef');
  });

  it('does NOT flag an unresolved report on app home (nothing for the resolver to look up)', () => {
    expect(selectFreshnessTarget(null, reports, aggregate).unresolvedReportId).toBeUndefined();
  });

  it('falls back to an EMPTY aggregate before the report list resolves (fetcher then yields null)', () => {
    expect(selectFreshnessTarget(REPORT_A, [], [])).toEqual({
      mode: 'aggregate',
      datasets: [],
      unresolvedReportId: REPORT_A,
    });
  });

  it('returns a copy of the aggregate list, not the live ref array', () => {
    const target = selectFreshnessTarget(null, reports, aggregate);
    expect(target.datasets).not.toBe(aggregate);
  });
});
