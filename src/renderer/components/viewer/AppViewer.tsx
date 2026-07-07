import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { AppsRegular } from '@fluentui/react-icons';
import { ViewerToolbar } from './ViewerToolbar';
import { AnnotationLayer } from './AnnotationLayer';
import { MagnifierLayer } from './MagnifierLayer';
import { EMBED } from '../../../shared/constants';
import { useLiveFreshness } from '../../hooks/useLiveFreshness';
import {
  parseReportIdFromUrl,
  selectFreshnessTarget,
  type AppReportFreshnessInfo,
  type DatasetWorkspacePair,
} from './app-report-freshness';
import { reportIssue } from '../../lib/report-issue';
import { useAuthStore } from '../../stores/auth-store';

interface ElectronWebView extends HTMLElement {
  src: string;
  partition?: string;
  useragent?: string;
  allowpopups?: string;
  reload: () => void;
  canGoBack: () => boolean;
  goBack: () => void;
  addEventListener: (event: string, handler: (event: Event) => void) => void;
  removeEventListener: (event: string, handler: (event: Event) => void) => void;
}

export const AppViewer: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const webviewRef = useRef<ElectronWebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>('App');
  const [partitionName, setPartitionName] = useState<string | null>(null);
  const [userAgent, setUserAgent] = useState<string | undefined>(undefined);
  const [partitionLoaded, setPartitionLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshedAt, setJustRefreshedAt] = useState<number | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationEpoch, setAnnotationEpoch] = useState(0);
  const [isMagnifying, setIsMagnifying] = useState(false);

  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);
  const [datasetCount, setDatasetCount] = useState(0);
  const datasetsRef = useRef<Array<{ datasetId: string; workspaceId: string }>>([]);
  const appReportsRef = useRef<AppReportFreshnessInfo[]>([]);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const currentReportIdRef = useRef<string | null>(null);
  const [resolvedTargets, setResolvedTargets] = useState<ReadonlyMap<string, DatasetWorkspacePair | null>>(
    () => new Map(),
  );
  const resolvedTargetsRef = useRef<Map<string, DatasetWorkspacePair | null>>(new Map());

  useEffect(() => {
    const loadPartition = async () => {
      try {
        const config = await window.electronAPI.app.getAppWebviewConfig();
        setPartitionName(config.partition);
        setUserAgent(config.userAgent);
      } catch (error) {
        console.warn('[AppViewer] Failed to load webview config:', error);
      } finally {
        setPartitionLoaded(true);
      }
    };
    loadPartition();
  }, []);

  const loadAppDetails = useCallback(async () => {
    if (!appId) return;

    try {
      const appResponse = await window.electronAPI.content.getApp(appId);
      if (appResponse.success && appResponse.data) {
        setAppName(appResponse.data.name);
      }
    } catch (err) {
      console.error('[AppViewer] Failed to load app details:', err);
    }
  }, [appId]);

  useEffect(() => {
    if (!appId) {
      setError('Invalid app parameters');
      setIsLoading(false);
      return;
    }

    void loadAppDetails();
  }, [appId, loadAppDetails]);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    resolvedTargetsRef.current = new Map();
    setResolvedTargets(new Map());
    void (async () => {
      try {
        const reportsResp = await window.electronAPI.content.getAppReports(appId);
        if (cancelled || !reportsResp.success) return;
        appReportsRef.current = reportsResp.data.map((r) => ({
          id: r.id,
          name: r.name,
          datasetId: r.datasetId,
          workspaceId: r.workspaceId,
          originalReportObjectId: r.originalReportObjectId,
        }));
        const seen = new Set<string>();
        const datasets: Array<{ datasetId: string; workspaceId: string }> = [];
        for (const r of reportsResp.data) {
          if (r.datasetId && r.workspaceId && !seen.has(r.datasetId)) {
            seen.add(r.datasetId);
            datasets.push({ datasetId: r.datasetId, workspaceId: r.workspaceId });
          }
        }
        datasetsRef.current = datasets;
        setDatasetCount(datasets.length);
        if (datasets.length > 0) setLastLoadAt(Date.now());
      } catch (err) {
        console.warn('[AppViewer] Could not resolve app datasets for freshness:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const {
    datasetRefreshTime,
    dataflowRefreshTime,
    scheduleOverdue,
    scheduleSummary,
    newDataAvailable,
  } = useLiveFreshness(
    useCallback(async () => {
      let target = selectFreshnessTarget(
        currentReportIdRef.current,
        appReportsRef.current,
        datasetsRef.current,
      );
      const urlReportId = currentReportIdRef.current?.toLowerCase() ?? null;
      if (urlReportId && appId) {
        let resolved = resolvedTargetsRef.current.get(urlReportId);
        if (resolved === undefined) {
          const resp = await window.electronAPI.content.resolveAppReportDataset(appId, urlReportId);
          if (resp.success) {
            resolved = resp.data;
            resolvedTargetsRef.current.set(urlReportId, resp.data);
            setResolvedTargets(new Map(resolvedTargetsRef.current));
          }
        }
        if (resolved) target = { mode: 'report', datasets: [resolved] };
      }
      const first = target.datasets[0];
      if (!first) return null;
      const r = await window.electronAPI.content.getDataFreshness(first.workspaceId, target.datasets);
      if (!r.success) return null;
      return {
        datasetRefreshTime: r.data.datasetRefreshTime,
        dataflowRefreshTime: r.data.dataflowRefreshTime,
        scheduleOverdue: r.data.scheduleOverdue,
        scheduleSummary: r.data.scheduleSummary,
      };
    }, [appId]),
    lastLoadAt,
  );

  const headerTarget = selectFreshnessTarget(
    currentReportId,
    appReportsRef.current,
    datasetsRef.current,
  );
  const apiResolvedPair = currentReportId
    ? resolvedTargets.get(currentReportId.toLowerCase()) ?? null
    : null;
  const isReportTargeted = headerTarget.mode === 'report' || apiResolvedPair !== null;
  const freshnessLabel = isReportTargeted || datasetCount <= 1 ? 'Data refreshed' : 'Oldest data';
  const ownerEmail = useAuthStore((s) => s.user?.email);
  const headerMode = apiResolvedPair
    ? 'report (api lookup)'
    : headerTarget.mode === 'report'
      ? 'report (list match)'
      : headerTarget.unresolvedReportId
        ? `aggregate (unresolved: ${resolvedTargets.has(headerTarget.unresolvedReportId) ? 'api said no dataset' : 'api lookup pending/failed'})`
        : 'aggregate';
  const freshnessDiagnostic =
    (ownerEmail ?? '').toLowerCase() === 'brendan@bc-abc.com'
      ? `url report: ${currentReportId ?? 'none (app home)'} · mode: ${headerMode} · app reports known: ${appReportsRef.current.length}`
      : null;

  useEffect(() => {
    if (error) reportIssue({ code: 'APP_WEBVIEW_ERROR', itemName: appName, context: error });
  }, [error, appName]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const handleDidStartLoading = () => {
      setIsLoading(true);
      setError(null);
      clearWatchdog();
      watchdog = setTimeout(() => {
        console.error('[AppViewer] Webview load watchdog fired after', EMBED.WATCHDOG_MS, 'ms');
        setError(
          'This app is taking too long to load. Your connection may be blocked by a proxy or VPN. Check your network, then try again.',
        );
        setIsLoading(false);
      }, EMBED.WATCHDOG_MS);
    };

    const handleDidStopLoading = () => {
      clearWatchdog();
      setIsLoading(false);
      setLastLoadAt(Date.now());
    };

    const handleDidFailLoad = (event: Event) => {
      const e = event as CustomEvent;
      if (e.detail?.errorCode === -3) return;
      if (e.detail?.isMainFrame === false) return;
      clearWatchdog();
      console.error('[AppViewer] Webview failed to load:', e.detail);
      setError(`Failed to load app: ${e.detail?.errorDescription || 'Unknown error'}`);
      setIsLoading(false);
    };

    const handleCrashed = () => {
      clearWatchdog();
      console.error('[AppViewer] Webview render process gone');
      setError('The app stopped unexpectedly. Click Try again to reload it.');
      setIsLoading(false);
    };

    const handleNavigation = (event: Event) => {
      const e = event as Event & { url?: string; isMainFrame?: boolean };
      if (e.isMainFrame === false) return;
      const reportId = parseReportIdFromUrl(e.url);
      if (reportId === currentReportIdRef.current) return;
      currentReportIdRef.current = reportId;
      setCurrentReportId(reportId);
      setLastLoadAt(Date.now());
      setAnnotationEpoch((epoch) => epoch + 1);
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('render-process-gone', handleCrashed);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);

    return () => {
      clearWatchdog();
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('render-process-gone', handleCrashed);
      webview.removeEventListener('did-navigate', handleNavigation);
      webview.removeEventListener('did-navigate-in-page', handleNavigation);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = webview as any;
        if (w) {
          if (typeof w.stop === 'function') w.stop();
          w.src = 'about:blank';
        }
      } catch (err) {
        console.warn('[AppViewer] Webview teardown failed (non-fatal):', err);
      }
    };
  }, [partitionLoaded]);

  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    setError(null);
    setIsLoading(true);
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setAnnotationEpoch((epoch) => epoch + 1);
    webview.reload();
  }, []);

  const toggleAnnotate = useCallback(() => {
    setIsMagnifying(false);
    setIsAnnotating((v) => !v);
  }, []);

  const toggleMagnify = useCallback(() => {
    setIsAnnotating(false);
    setIsMagnifying((v) => !v);
  }, []);

  useEffect(() => {
    if (!isRefreshingRef.current) return;
    if (isLoading) return;
    isRefreshingRef.current = false;
    setIsRefreshing(false);
    setJustRefreshedAt(Date.now());
  }, [isLoading]);

  const handleBack = () => {
    navigate('/apps');
  };

  const appUrl = appId ? `https://app.powerbi.com/groups/me/apps/${appId}` : '';

  return (
    <div className="h-full flex flex-col">
      {}
      <h1 className="sr-only">App: {appName}</h1>

      {}
      <ViewerToolbar
        onBack={handleBack}
        backLabel="Back to Apps"
        itemName={appName}
        titleIcon={<AppsRegular />}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastDataRefresh={datasetRefreshTime}
        dataflowRefresh={dataflowRefreshTime}
        scheduleOverdue={scheduleOverdue}
        scheduleSummary={scheduleSummary}
        freshnessLabel={freshnessLabel}
        freshnessDiagnostic={freshnessDiagnostic}
        showRelativeAge
        showFreshness
        justRefreshedAt={justRefreshedAt}
        newDataAvailable={newDataAvailable}
        onAnnotate={toggleAnnotate}
        isAnnotating={isAnnotating}
        onMagnify={toggleMagnify}
        isMagnifying={isMagnifying}
      />

      {}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center">
              <Spinner size="large" />
              <Text className="mt-4 text-neutral-foreground-2 block">
                Loading {appName}...
              </Text>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10"
          >
            <div className="text-center max-w-md">
              <Text className="text-status-error block mb-4">{error}</Text>
              <Button appearance="primary" onClick={handleRefresh}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {}
        {}
        {appUrl && partitionLoaded && (
          <webview
            ref={webviewRef}
            src={appUrl}
            className="w-full h-full"
            style={{
              visibility: error ? 'hidden' : 'visible',
              border: 'none',
            }}
            partition={partitionName || undefined}
            useragent={userAgent}
            allowpopups={true}
          />
        )}

        {isAnnotating && !isLoading && !error && (
          <AnnotationLayer
            key={annotationEpoch}
            className="z-30"
            onExit={() => setIsAnnotating(false)}
          />
        )}

        {isMagnifying && !isLoading && !error && (
          <MagnifierLayer
            targetRef={webviewRef as unknown as React.RefObject<HTMLElement | null>}
            className="z-30"
            onExit={() => setIsMagnifying(false)}
          />
        )}
      </div>
    </div>
  );
};

export default AppViewer;
