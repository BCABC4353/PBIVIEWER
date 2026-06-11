
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

export interface AdminAuthPort {
  getAdminAccessToken?(): Promise<IPCResponse<TokenResult>>;
}

export interface AdminPort {
  auth: AdminAuthPort;
  getApps(): Promise<IPCResponse<App[]>>;
  getCacheEpoch(): number;
}

export class PowerBIAdminApi {
  private readonly port: AdminPort;

  private adminInsightsCache: { value: AdminInsights; expires: number } | null = null;
  private static readonly ADMIN_INSIGHTS_TTL_MS = 10 * 60 * 1000;

  constructor(port: AdminPort) {
    this.port = port;
  }

  clearCache(): void {
    this.adminInsightsCache = null;
  }

  private async makeAdminRequest<T>(endpoint: string): Promise<T> {
    const getAdminToken = this.port.auth.getAdminAccessToken?.bind(this.port.auth);
    if (!getAdminToken) {
      throw new Error('ADMIN_NOT_WIRED: admin token source not configured');
    }
    return withRetry(async () => {
      const tokenResponse = await getAdminToken();
      if (!tokenResponse.success) {
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
        throw new Error('ADMIN_REQUIRED: this account is not a Fabric administrator');
      }
      if (!response.ok) {
        await throwForStatus(response, 'Power BI admin API error');
      }
      return response.json() as Promise<T>;
    }, { maxAttempts: 2 });
  }

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

      const epochAtStart = this.port.getCacheEpoch();
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
            const msg = String(err);
            if (msg.includes('ADMIN_REQUIRED') || msg.includes('ADMIN_TOKEN:') || msg.includes('ADMIN_NOT_WIRED')) {
              throw err;
            }
            return { appId: app.id, appName: app.name, users: null };
          }
        },
      );

      const byUser = new Map<string, { views: number; lastActive: string }>();
      const byItem = new Map<string, { views: number; users: Set<string>; lastViewed: string }>();
      let failedDays = 0;
      const MAX_TOTAL_EVENTS = 250_000;
      let totalEvents = 0;
      let truncatedForVolume = false;

      for (let d = 0; d < boundedDays; d++) {
        const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const y = day.getUTCFullYear();
        const m = String(day.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(day.getUTCDate()).padStart(2, '0');
        let url: string | undefined =
          `/admin/activityevents?startDateTime='${y}-${m}-${dd}T00:00:00.000Z'` +
          `&endDateTime='${y}-${m}-${dd}T23:59:59.999Z'` +
          `&$filter=Activity eq 'ViewReport'`;
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
      if (this.port.getCacheEpoch() === epochAtStart) {
        this.adminInsightsCache = {
          value: result,
          expires: Date.now() + PowerBIAdminApi.ADMIN_INSIGHTS_TTL_MS,
        };
      }
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
