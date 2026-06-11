// ---------------------------------------------------------------------------
// Export tier: report → PDF export plus the user-owns-data embed token. Both
// need the RAW access token (they hand it to fetch / the embed SDK rather
// than going through the facade's request plumbing), so the port is the
// token slice of the auth service.
// ---------------------------------------------------------------------------

import {
  POWERBI_API_BASE,
  fetchWithTimeout,
  parseRetryAfter,
  sanitizeErrorBody,
  throwForStatus,
  withRetry,
} from './http';
import { withErrorEnvelope } from './envelope';
import type { EmbedToken, IPCResponse, TokenResult } from '../../../shared/types';

/** Token source for export/embed calls (structurally the facade's ApiAuthPort). */
export interface ExportAuthPort {
  getAccessToken(): Promise<IPCResponse<TokenResult>>;
}

export class PowerBIExportApi {
  private readonly auth: ExportAuthPort;

  constructor(auth: ExportAuthPort) {
    this.auth = auth;
  }

  async getEmbedToken(
    _reportId: string,
    _workspaceId: string
  ): Promise<IPCResponse<EmbedToken>> {
    return withErrorEnvelope('EMBED_TOKEN_FAILED', async () => {
      // For user-owns-data scenario, we use the access token directly
      // For app-owns-data, we would generate an embed token
      const tokenResponse = await this.auth.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      // Prefer MSAL's authoritative expiry; fall back to +1h only when null.
      const expiration =
        tokenResponse.data.expiresOn ?? new Date(Date.now() + 3600000).toISOString();

      // Return the access token as the embed token for user-owns-data scenario
      return {
        success: true,
        data: {
          token: tokenResponse.data.accessToken,
          tokenId: '', // Not used in user-owns-data
          expiration,
        },
      };
    });
  }

  async exportReportToPdf(
    reportId: string,
    workspaceId: string,
    pageName?: string,
    bookmarkState?: string
  ): Promise<IPCResponse<Buffer>> {
    return withErrorEnvelope('EXPORT_REPORT_FAILED', async () => {
      const tokenResponse = await this.auth.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      const accessToken = tokenResponse.data.accessToken;
      const baseUrl = `${POWERBI_API_BASE}/groups/${workspaceId}/reports/${reportId}`;

      const reportConfig: Record<string, unknown> = {
        settings: { includeHiddenPages: false },
      };

      if (bookmarkState) {
        reportConfig.defaultBookmark = { state: bookmarkState };
      }

      if (pageName) {
        const page: Record<string, unknown> = { pageName };
        if (bookmarkState) {
          page.bookmark = { state: bookmarkState };
        }
        reportConfig.pages = [page];
      }

      // Wrap the kickoff ExportTo POST in withRetry so a transient 429/5xx on
      // start-up backs off and retries (throwForStatus throws RetriableHttpError
      // for those; other 4xx short-circuit). The poll loop below already handles
      // transient errors — this brings the initial POST to parity.
      const exportResponse = await withRetry(async () => {
        const resp = await fetchWithTimeout(`${baseUrl}/ExportTo`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            format: 'PDF',
            powerBIReportConfiguration: reportConfig,
          }),
        });
        if (!resp.ok) {
          await throwForStatus(resp, 'Export request');
        }
        return resp;
      });

      const exportJson = await exportResponse.json() as { id?: string };
      const exportId = exportJson.id;
      if (!exportId) {
        throw new Error('Export request did not return an export id');
      }

      let attempts = 0;
      const maxAttempts = 30;
      let status: string | undefined;

      while (attempts < maxAttempts) {
        // Shorter per-call timeout for the polling loop — the 30-iteration cap
        // bounds total wait time; we don't want each poll holding the default 20s.
        // A transient timeout, 429, or 5xx on a poll is non-fatal: count the
        // attempt and continue (honoring Retry-After if present). Only a non-
        // retriable 4xx, a "Failed" status payload, or running out the cap
        // aborts the export.
        let statusResponse: Response;
        try {
          statusResponse = await fetchWithTimeout(
            `${baseUrl}/exports/${exportId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
            10000
          );
        } catch (pollErr: unknown) {
          if ((pollErr as { name?: string } | null)?.name === 'AbortError') {
            // Per-poll timeout — keep trying.
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          throw pollErr;
        }

        if (!statusResponse.ok) {
          if (statusResponse.status === 429) {
            const retryAfterMs =
              parseRetryAfter(statusResponse.headers.get('Retry-After')) ?? 2000;
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
            continue;
          }
          if (statusResponse.status >= 500 && statusResponse.status < 600) {
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          const errorText = await statusResponse.text();
          throw new Error(
            `Export status failed: ${statusResponse.status} - ${sanitizeErrorBody(errorText)}`
          );
        }

        const statusJson = await statusResponse.json() as { status?: string; error?: { message?: string } };
        status = statusJson.status;

        if (status === 'Succeeded') {
          break;
        }

        if (status === 'Failed') {
          throw new Error(statusJson.error?.message || 'Export failed');
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (status !== 'Succeeded') {
        throw new Error('Export timed out');
      }

      const fileResponse = await fetchWithTimeout(`${baseUrl}/exports/${exportId}/file`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        throw new Error(`Export file failed: ${fileResponse.status} - ${sanitizeErrorBody(errorText)}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { success: true, data: buffer };
    });
  }
}
