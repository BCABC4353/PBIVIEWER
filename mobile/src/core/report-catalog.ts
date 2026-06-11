/**
 * Live report catalog — the signed-in user's REAL reports, grouped by source:
 * Power BI Apps first (GET /apps → /apps/{id}/reports), then workspaces
 * (GET /groups → /groups/{id}/reports). Same posture as LiveFleetClient:
 * injected TokenProvider, bounded 429 retry, tolerant per-source failures.
 * Pagination follows @odata.nextLink wherever the API hands one back.
 */
import type { TokenProvider } from './types';

const BASE = 'https://api.powerbi.com/v1.0/myorg';
const MAX_429_RETRIES = 2;
const MAX_RETRY_AFTER_S = 60;
/** Hard ceiling on @odata.nextLink hops — a buggy/hostile server can't loop us. */
const MAX_PAGES = 25;
const SOURCE_CONCURRENCY = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One real report, with everything the canvas crosswalk needs to query it. */
export interface ReportRef {
  id: string;
  name: string;
  /** Dataset behind the report — absent for paginated/RDL-style reports. */
  datasetId?: string;
  sourceKind: 'app' | 'workspace';
  sourceId: string;
  sourceName: string;
  /** Workspace that owns the dataset, when known (workspace reports, and
   *  app reports via the app's source workspace). */
  workspaceId?: string;
  /** App reports: the same report's id in the source workspace. Used to hop
   *  to the dataset when the app listing returns datasetId="" (tenant-verified
   *  quirk, diagnose-pbi 2026-06-10). */
  originalReportId?: string;
}

/** Reports grouped by where they came from; apps always sort before workspaces. */
export interface ReportGroup {
  kind: 'app' | 'workspace';
  id: string;
  name: string;
  reports: ReportRef[];
}

export interface ReportCatalogResult {
  groups: ReportGroup[];
  /** Sources that errored while listing their reports (partial honesty). */
  failedSources: string[];
}

/** What the UI needs from a catalog — keeps screens testable with fakes. */
export interface ReportCatalog {
  listReports(force?: boolean): Promise<ReportCatalogResult>;
}

// ---------------------------------------------------------------------------
// Catalog organization — pure helpers the Reports screen renders from.
// All sorting is locale-aware and case-insensitive so "zebra" files next to
// "Alpha" the way a human expects, regardless of the tenant's casing habits.
// ---------------------------------------------------------------------------

/** Locale-aware, case-insensitive name comparison. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/** Stable identity for a section (group ids can collide across kinds). */
export function groupKey(g: Pick<ReportGroup, 'kind' | 'id'>): string {
  return `${g.kind}-${g.id}`;
}

/**
 * Order the catalog for display: Power BI Apps first (alphabetical), then
 * workspaces (alphabetical), reports alphabetical within each section.
 * Pure — returns new arrays, never mutates the input.
 */
export function sortCatalogGroups(groups: readonly ReportGroup[]): ReportGroup[] {
  const rank = (g: ReportGroup): number => (g.kind === 'app' ? 0 : 1);
  return [...groups]
    .sort((a, b) => rank(a) - rank(b) || compareNames(a.name, b.name))
    .map((g) => ({ ...g, reports: [...g.reports].sort((a, b) => compareNames(a.name, b.name)) }));
}

/**
 * Filter sections by a search query matching report names OR section names
 * (case-insensitive substring). A section-name hit keeps the whole section;
 * otherwise only the matching reports survive. Empty/whitespace query
 * returns the input unchanged.
 */
export function filterCatalogGroups(
  groups: readonly ReportGroup[],
  query: string,
): ReportGroup[] {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return [...groups];
  const out: ReportGroup[] = [];
  for (const g of groups) {
    if (g.name.toLocaleLowerCase().includes(q)) {
      out.push(g);
      continue;
    }
    const reports = g.reports.filter((r) => r.name.toLocaleLowerCase().includes(q));
    if (reports.length > 0) out.push({ ...g, reports });
  }
  return out;
}

/**
 * Sections start collapsed EXCEPT when the whole catalog is small (≤3
 * sections) — then everything is open and the list reads at a glance.
 */
export function defaultExpandedKeys(groups: readonly ReportGroup[]): Set<string> {
  return groups.length <= 3 ? new Set(groups.map(groupKey)) : new Set<string>();
}

interface ODataPage<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

/**
 * Drain an OData collection: fetch `firstUrl`, then keep following
 * @odata.nextLink until it disappears (or repeats / exceeds MAX_PAGES —
 * defensive caps so malformed paging can never hang the list).
 * Pure paging logic: the actual HTTP lives in the injected `getJson`.
 */
export async function listAllPages<T>(
  getJson: (url: string) => Promise<unknown>,
  firstUrl: string,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  const visited = new Set<string>();
  let url: string | undefined = firstUrl;
  for (let page = 0; url !== undefined && page < maxPages; page++) {
    visited.add(url);
    const body = (await getJson(url)) as ODataPage<T> | null | undefined;
    if (Array.isArray(body?.value)) out.push(...body.value);
    const next = body?.['@odata.nextLink'];
    url = typeof next === 'string' && next.length > 0 && !visited.has(next) ? next : undefined;
  }
  return out;
}

interface RawApp {
  id: string;
  name: string;
  /** The app's source workspace — where its reports' datasets live. */
  workspaceId?: string;
}
interface RawGroup {
  id: string;
  name: string;
}
interface RawReport {
  id: string;
  name: string;
  datasetId?: string;
  reportType?: string;
  /** App reports only: the SAME report's id in the source workspace. */
  originalReportObjectId?: string;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i] as T);
      }
    }),
  );
  return results;
}

export class LiveReportCatalog implements ReportCatalog {
  private cache: { value: ReportCatalogResult; expires: number } | null = null;
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(private readonly tokens: TokenProvider) {}

  /** GET with auth + bounded 429 retry (same discipline as LiveFleetClient). */
  private async getJson(url: string): Promise<unknown> {
    const absolute = url.startsWith('http') ? url : `${BASE}${url}`;
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokens.getAccessToken();
      const res = await fetch(absolute, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const seconds =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, MAX_RETRY_AFTER_S)
            : 2 * (attempt + 1);
        await sleep(seconds * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Power BI API ${res.status} on ${absolute}`);
      return (await res.json()) as unknown;
    }
  }

  private async tryListAll<T>(path: string): Promise<T[] | null> {
    try {
      return await listAllPages<T>((u) => this.getJson(u), path);
    } catch {
      return null;
    }
  }

  /**
   * List every report the user can see, apps first then workspaces.
   * Throws only when BOTH the apps and the workspaces roots are unreachable
   * (bad sign-in / network); individual source failures degrade to
   * `failedSources` so one broken workspace never blanks the list.
   */
  async listReports(force = false): Promise<ReportCatalogResult> {
    if (!force && this.cache && this.cache.expires > Date.now()) return this.cache.value;

    const [apps, workspaces] = await Promise.all([
      this.tryListAll<RawApp>('/apps'),
      this.tryListAll<RawGroup>('/groups'),
    ]);
    if (apps === null && workspaces === null) {
      throw new Error('Could not reach Power BI — check sign-in and network.');
    }

    const groups: ReportGroup[] = [];
    const failedSources: string[] = [];

    const appGroups = await mapWithConcurrency(apps ?? [], SOURCE_CONCURRENCY, async (app) => {
      const reports = await this.tryListAll<RawReport>(`/apps/${app.id}/reports`);
      if (reports === null) {
        failedSources.push(app.name);
        return null;
      }
      return this.toGroup('app', app.id, app.name, reports, app.workspaceId);
    });
    const wsGroups = await mapWithConcurrency(workspaces ?? [], SOURCE_CONCURRENCY, async (ws) => {
      const reports = await this.tryListAll<RawReport>(`/groups/${ws.id}/reports`);
      if (reports === null) {
        failedSources.push(ws.name);
        return null;
      }
      return this.toGroup('workspace', ws.id, ws.name, reports, ws.id);
    });

    // Apps first, then workspaces; empty sources stay out of the list.
    for (const g of [...appGroups, ...wsGroups]) {
      if (g && g.reports.length > 0) groups.push(g);
    }

    const result: ReportCatalogResult = { groups, failedSources };
    this.cache = { value: result, expires: Date.now() + LiveReportCatalog.TTL_MS };
    return result;
  }

  private toGroup(
    kind: 'app' | 'workspace',
    id: string,
    name: string,
    reports: RawReport[],
    datasetWorkspaceId?: string,
  ): ReportGroup {
    return {
      kind,
      id,
      name,
      reports: reports
        .filter((r) => typeof r.id === 'string' && typeof r.name === 'string')
        .map((r) => ({
          id: r.id,
          name: r.name,
          datasetId: typeof r.datasetId === 'string' && r.datasetId ? r.datasetId : undefined,
          sourceKind: kind,
          sourceId: id,
          sourceName: name,
          workspaceId: datasetWorkspaceId,
          originalReportId:
            typeof r.originalReportObjectId === 'string' && r.originalReportObjectId
              ? r.originalReportObjectId
              : undefined,
        })),
    };
  }
}

/** Latest refresh of a dataset — shown on the honest "can't query" screen. */
export interface LatestRefresh {
  status: string;
  endTime?: string;
}

/**
 * Best-effort latest refresh: group route when the workspace is known, then
 * the My-Workspace route. Null when neither answers — callers must degrade
 * quietly, never block on this.
 */
export async function fetchLatestRefresh(
  tokens: TokenProvider,
  datasetId: string,
  workspaceId?: string,
): Promise<LatestRefresh | null> {
  const paths = [
    ...(workspaceId ? [`/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=1`] : []),
    `/datasets/${datasetId}/refreshes?$top=1`,
  ];
  for (const path of paths) {
    try {
      const token = await tokens.getAccessToken();
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const body = (await res.json()) as { value?: Array<{ status?: string; endTime?: string }> };
      const first = body.value?.[0];
      if (first?.status) return { status: first.status, endTime: first.endTime };
      return null; // route worked but no refresh history (push/live dataset)
    } catch {
      /* try the next route */
    }
  }
  return null;
}

/**
 * Pick a dataset id from a workspace's report listing: exact original-id
 * match first, then case-insensitive name match. Pure - unit-tested.
 */
export function pickDatasetIdFromReports(
  reports: ReadonlyArray<{ id?: string; name?: string; datasetId?: string }>,
  originalReportId?: string,
  reportName?: string,
): string | undefined {
  const byId = originalReportId ? reports.find((r) => r.id === originalReportId) : undefined;
  if (byId && typeof byId.datasetId === 'string' && byId.datasetId) return byId.datasetId;
  const lower = reportName ? reportName.toLowerCase() : undefined;
  const byName = lower ? reports.find((r) => r.name && r.name.toLowerCase() === lower) : undefined;
  return byName && typeof byName.datasetId === 'string' && byName.datasetId
    ? byName.datasetId
    : undefined;
}

/**
 * Resolve the dataset behind an APP report. Tenant-verified quirk
 * (diagnose-pbi, 2026-06-10): /apps/{id}/reports returns datasetId as ""
 * but carries originalReportObjectId - the same report in the app's source
 * workspace, where datasetId IS populated. One hop recovers it.
 *
 * Returns the datasetId, or null when the source workspace genuinely has no
 * queryable dataset for this report (paginated etc.). THROWS when the source
 * workspace cannot be read at all (network/permission), so callers can show
 * the real failure instead of mislabeling it "paginated".
 */
export async function resolveReportDatasetId(
  tokens: TokenProvider,
  report: ReportRef,
): Promise<string | null> {
  if (report.datasetId) return report.datasetId;
  const ws = report.workspaceId;
  if (!ws) return null;
  const getJson = async (path: string): Promise<unknown> => {
    const token = await tokens.getAccessToken();
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Power BI API ${res.status} on ${path}`);
    return (await res.json()) as unknown;
  };
  // Cheap path: fetch the single source-workspace report by its original id.
  if (report.originalReportId) {
    try {
      const r = (await getJson(`/groups/${ws}/reports/${report.originalReportId}`)) as {
        datasetId?: string;
      };
      if (typeof r.datasetId === 'string' && r.datasetId) return r.datasetId;
    } catch {
      /* fall through to the listing path */
    }
  }
  // Listing path: id match first, then name match. Failures here propagate.
  const page = (await getJson(`/groups/${ws}/reports`)) as { value?: RawReport[] };
  return pickDatasetIdFromReports(page.value ?? [], report.originalReportId, report.name) ?? null;
}
