
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
      const tokenResponse = await this.auth.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      const expiration =
        tokenResponse.data.expiresOn ?? new Date(Date.now() + 3600000).toISOString();

      return {
        success: true,
        data: {
          token: tokenResponse.data.accessToken,
          tokenId: '',
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
        let statusResponse: Response;
        try {
          statusResponse = await fetchWithTimeout(
            `${baseUrl}/exports/${exportId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
            10000
          );
        } catch (pollErr: unknown) {
          if ((pollErr as { name?: string } | null)?.name === 'AbortError') {
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
