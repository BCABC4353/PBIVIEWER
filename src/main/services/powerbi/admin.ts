// ---------------------------------------------------------------------------
// Admin tier (Fabric admin + Tenant.Read.All via incremental consent)
// ---------------------------------------------------------------------------

import {
  POWERBI_API_BASE,
  fetchWithTimeout,
  mapWithConcurrency,
  throwForStatus,
  withRetry,
  type PowerBIApiResponse,
} from './http';
import { buildErrorEnvelope } from './envelope';
import type {
  App,
  AdminInsights,
  AdminAppAudience,
  IPCResponse,
  TokenResult,
} from '../../../shared/types';

/** Admin-token slice of the auth service (structurally matches the facade's
 *  ApiAuthPort, so the facade passes its deps.auth straight through). */
export interface AdminAuthPort {
  /** Admin-tier token (Tenant.Read.All) via incremental consent. Optional so
   *  test fakes that never touch admin endpoints don't have to provide it. */
  getAdminAccessToken?(): Promise<IPCResponse<TokenResult>>;
}

export interface AdminPort {
  auth: AdminAuthPort;
  getApps(): Promise<IPCResponse<App[]>>;
}

export class PowerBIAdminApi {
  private readonly port: AdminPort;

  private adminInsightsCache: { value: AdminInsights; expires: number } | null = null;
  private static readonly ADMIN_INSIGHTS_TTL_MS = 10 * 60 * 1000;

  constructor(port: AdminPort) {
    this.port = port;
  }

  /** Drop the cached admin snapshot. Account-scoped — see the facade's clearCaches(). */
  clearCache(): void {
    this.adminInsightsCache = null;
  }

  /** Request against an admin endpoint using the admin-tier token. */
  private async makeAdminRequest<T>(endpoint: string): Promise<T> {
    const getAdminToken = this.port.auth.getAdminAccessToken?.bind(this.port.auth);
    if (!getAdminToken) {
      throw new Error('ADMIN_NOT_WIRED: admin token source not configured');
    }
    // maxAttempts 2 (not the default 3): the admin tier fires MANY requests
    // per unlock (per-app audiences + per-day activity pages). On a throttled
    // tenant, 3 attempts × up-to-60s Retry-After per call stacks into the
    // multi-minute "Checking with Microsoft…" hang the owner hit. One retry
    // still absorbs a transient 429/5xx without compounding the wait.
    return withRetry(async () => {
      const tokenResponse = await getAdminToken();
      if (!tokenResponse.success) {
        // Carry the auth error code through so callers can distinguish a
        // declined consent from a network failure.
        throw new Error(`ADMIN_TOKEN:${tokenResponse.error.code}: ${tokenResponse.error.message}`);
      }
      const url = endpoint.startsWith('https://') ? endpoint : `${POWERBI_API_BASE}${endpoint}`;
      const response = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.status === 401 || response.status === 403) {
        // Token was issued but the API refused it: the account is not a
        // Fabric admin (or admin API access is disabled in the tenant).
        throw new Error('ADMIN_REQUIRED: this account is not a Fabric administrator');
      }
      if (!response.ok) {
        await throwForStatus(response, 'Power BI admin API error');
      }
      return response.json() as Promise<T>;
    }, { maxAttempts: 2 });
  }

  /**
   * Admin insights: App audiences (who can open each published App) and the
   * tenant activity log aggregated into who-uses-what (last `days` days, max
   * 14; the activity API serves one UTC day per request with continuation).
   * Requires the signed-in user to be a Fabric admin; the admin token is
   * acquired via incremental consent and never touches regular sign-ins.
   */
  // Default days = 2 (was 7): the first unlock must come back fast on a real
  // tenant — each extra day is another full activity-log walk. The UI can
  // explicitly request a wider window later.
  async getAdminInsights(days = 2, force = false): Promise<IPCResponse<AdminInsights>> {
    try {
      const boundedDays = Math.max(1, Math.min(14, Math.floor(days)));
      if (
        !force &&
        this.adminInsightsCache &&
        this.adminInsightsCache.expires > Date.now() &&
        this.adminInsightsCache.value.days === boundedDays
      ) {
        return { success: true, data: { ...this.adminInsightsCache.value, fromCache: true } };
      }

      // App audiences — list the user's apps, then the admin users endpoint
      // per app. A single app failing degrades to users:null, not a page error.
      // Capped at 2 in flight: parallel enough that dozens of apps don't load
      // one-at-a-time, serial enough not to trip tenant throttling (which would
      // stack Retry-After waits and recreate the unlock hang).
      const appsResponse = await this.port.getApps();
      const appAudiences: AdminAppAudience[] = await mapWithConcurrency(
        appsResponse.success ? appsResponse.data : [],
        2,
        async (app): Promise<AdminAppAudience> => {
          try {
            const resp = await this.makeAdminRequest<PowerBIApiResponse<{
              displayName?: string;
              emailAddress?: string;
              identifier?: string;
              appUserAccessRight?: string;
              principalType?: string;
            }>>(`/admin/apps/${app.id}/users`);
            return {
              appId: app.id,
              appName: app.name,
              users: (resp.value ?? []).map((u) => ({
                name: u.displayName || u.emailAddress || u.identifier || 'Unknown',
                email: u.emailAddress,
                accessRight: u.appUserAccessRight || 'Unknown',
                type: u.principalType || 'User',
              })),
            };
          } catch (err) {
            // ADMIN_REQUIRED / consent errors must fail the whole call (the
            // entire admin tier is unavailable) — re-throw those; anything else
            // degrades just this app's audience list.
            const msg = String(err);
            if (msg.includes('ADMIN_REQUIRED') || msg.includes('ADMIN_TOKEN:') || msg.includes('ADMIN_NOT_WIRED')) {
              throw err;
            }
            return { appId: app.id, appName: app.name, users: null };
          }
        },
      );

      // Activity log — one UTC day per request, newest day first, following
      // continuationUri until lastResultSet. Aggregate report views.
      const byUser = new Map<string, { views: number; lastActive: string }>();
      const byItem = new Map<string, { views: number; users: Set<string>; lastViewed: string }>();
      let failedDays = 0;
      // Hard memory bound: a large tenant could return millions of events. We
      // only need aggregates, but the distinct-key Maps still grow with unique
      // users/items. Cap total processed events; hitting it marks the run
      // partial rather than risking an out-of-memory on a client machine.
      const MAX_TOTAL_EVENTS = 250_000;
      let totalEvents = 0;
      let truncatedForVolume = false;

      for (let d = 0; d < boundedDays; d++) {
        const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const y = day.getUTCFullYear();
        const m = String(day.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(day.getUTCDate()).padStart(2, '0');
        // The activity API requires quoted ISO datetimes within ONE UTC day.
        let url: string | undefined =
          `/admin/activityevents?startDateTime='${y}-${m}-${dd}T00:00:00.000Z'` +
          `&endDateTime='${y}-${m}-${dd}T23:59:59.999Z'` +
          `&$filter=Activity eq 'ViewReport'`;
        // Bound the per-day continuation walk: a repeated/circular
        // continuationUri (or a pathologically large day) must not loop
        // forever or grow memory without limit. 200 pages is far beyond any
        // real day; treat hitting the cap as a partial day.
        const seenUris = new Set<string>();
        const MAX_PAGES_PER_DAY = 200;
        try {
          let pages = 0;
          while (url) {
            if (seenUris.has(url) || pages >= MAX_PAGES_PER_DAY) {
              console.warn('[PowerBI admin] activity pagination capped/looping — treating day as partial');
              failedDays++;
              break;
            }
            seenUris.add(url);
            pages++;
            const resp: {
              activityEventEntities?: unknown;
              continuationUri?: string;
              lastResultSet?: boolean;
            } = await this.makeAdminRequest(url);
            // Defend against a shape we don't expect: the field may be absent,
            // null, or (in some tenants/regions) not an array. Anything other
            // than an array contributes no events instead of throwing.
            const entities = Array.isArray(resp.activityEventEntities)
              ? (resp.activityEventEntities as Array<Record<string, unknown>>)
              : [];
            for (const e of entities) {
              if (totalEvents >= MAX_TOTAL_EVENTS) {
                truncatedForVolume = true;
                break;
              }
              totalEvents++;
              const user = String(e.UserId ?? e.UserKey ?? e.UserAgent ?? '').trim() || 'Unknown';
              const item =
                String(e.ReportName ?? e.ItemName ?? e.ArtifactName ?? '').trim() || 'Unknown item';
              const rawTime = String(e.CreationTime ?? '').trim();
              // Only treat a value as "more recent" when it is a parseable time;
              // a blank/garbage CreationTime must never win the max() comparison.
              const time = Number.isNaN(Date.parse(rawTime)) ? '' : rawTime;
              const u = byUser.get(user) ?? { views: 0, lastActive: '' };
              u.views++;
              if (time && time > u.lastActive) u.lastActive = time;
              byUser.set(user, u);
              const it = byItem.get(item) ?? { views: 0, users: new Set<string>(), lastViewed: '' };
              it.views++;
              it.users.add(user);
              if (time && time > it.lastViewed) it.lastViewed = time;
              byItem.set(item, it);
            }
            if (truncatedForVolume) break;
            url = resp.lastResultSet === false && resp.continuationUri ? resp.continuationUri : undefined;
          }
        } catch (err) {
          const msg = String(err);
          if (msg.includes('ADMIN_REQUIRED') || msg.includes('ADMIN_TOKEN:') || msg.includes('ADMIN_NOT_WIRED')) {
            throw err;
          }
          failedDays++;
        }
        if (truncatedForVolume) break;
      }

      const result: AdminInsights = {
        generatedAt: new Date().toISOString(),
        fromCache: false,
        days: boundedDays,
        activityByUser: Array.from(byUser.entries())
          .map(([user, v]) => ({ user, views: v.views, lastActive: v.lastActive }))
          .sort((a, b) => b.views - a.views),
        activityByItem: Array.from(byItem.entries())
          .map(([name, v]) => ({
            name,
            views: v.views,
            uniqueUsers: v.users.size,
            lastViewed: v.lastViewed,
          }))
          .sort((a, b) => b.views - a.views),
        appAudiences,
        failedDays,
        truncated: truncatedForVolume,
      };
      this.adminInsightsCache = {
        value: result,
        expires: Date.now() + PowerBIAdminApi.ADMIN_INSIGHTS_TTL_MS,
      };
      return { success: true, data: result };
    } catch (error) {
      const msg = String(error);
      if (msg.includes('ADMIN_REQUIRED')) {
        return {
          success: false,
          error: {
            code: 'ADMIN_REQUIRED',
            message:
              'This view needs a Fabric administrator account. Your sign-in works, but Power BI refused admin access for it.',
          },
        };
      }
      const tokenCode = msg.match(/ADMIN_TOKEN:([A-Z_]+):/)?.[1];
      if (tokenCode) {
        return {
          success: false,
          error: {
            code: tokenCode,
            message:
              tokenCode === 'ADMIN_CONSENT_CANCELLED'
                ? 'The permission window was closed before consent was granted.'
                : msg,
          },
        };
      }
      return { success: false, error: buildErrorEnvelope('ADMIN_INSIGHTS_FAILED', error) };
    }
  }
}
