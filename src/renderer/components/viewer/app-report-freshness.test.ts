/**
 * App view per-report freshness — logic-level tests (no webview needed).
 *
 * Power BI stamps each report inside an app individually, so the header must
 * show the refresh time of the report CURRENTLY on screen:
 *   - parseReportIdFromUrl: the app SPA's URL is the only signal for which
 *     report is viewed — /reports/{guid}/ReportSection… → guid, home → null.
 *   - selectFreshnessTarget: a known report WITH a dataset → single-dataset
 *     getDataFreshness args ('report' mode); anything else → the app-wide
 *     aggregate fallback ('aggregate' mode, the v2.2.10 behavior).
 */

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
    // 37 hex-ish chars: a GUID-length prefix of a longer token must NOT match.
    expect(
      parseReportIdFromUrl(
        `https://app.powerbi.com/groups/me/apps/${APP_ID}/reports/${REPORT_A}f/ReportSection1`,
      ),
    ).toBeNull();
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

  it('falls back to the aggregate for a reportId not in the app report list', () => {
    const target = selectFreshnessTarget('deadbeef-dead-beef-dead-beefdeadbeef', reports, aggregate);
    expect(target.mode).toBe('aggregate');
    expect(target.datasets).toEqual(aggregate);
  });

  it('falls back to the aggregate when the viewed report has no datasetId', () => {
    const target = selectFreshnessTarget('cccccccc-0000-0000-0000-000000000000', reports, aggregate);
    expect(target.mode).toBe('aggregate');
    expect(target.datasets).toEqual(aggregate);
  });

  it('falls back to an EMPTY aggregate before the report list resolves (fetcher then yields null)', () => {
    expect(selectFreshnessTarget(REPORT_A, [], [])).toEqual({ mode: 'aggregate', datasets: [] });
  });

  it('returns a copy of the aggregate list, not the live ref array', () => {
    const target = selectFreshnessTarget(null, reports, aggregate);
    expect(target.datasets).not.toBe(aggregate);
  });
});
