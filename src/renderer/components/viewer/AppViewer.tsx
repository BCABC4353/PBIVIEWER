import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { AppsRegular } from '@fluentui/react-icons';
import { ViewerToolbar } from './ViewerToolbar';
import { EMBED } from '../../../shared/constants';
import { useLiveFreshness } from '../../hooks/useLiveFreshness';
import {
  parseReportIdFromUrl,
  selectFreshnessTarget,
  type AppReportFreshnessInfo,
} from './app-report-freshness';
import { reportIssue } from '../../lib/report-issue';
import { useAuthStore } from '../../stores/auth-store';

// Type definition for Electron webview element
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

  // --- Live data-freshness indicator (App view) ---
  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);
  const [datasetCount, setDatasetCount] = useState(0);
  const datasetsRef = useRef<Array<{ datasetId: string; workspaceId: string }>>([]);
  // FULL report list (id/name/datasetId/workspaceId), not just dataset pairs:
  // the header must stamp the report CURRENTLY viewed inside the app, and the
  // webview URL only gives us its reportId — this map turns it into a dataset.
  const appReportsRef = useRef<AppReportFreshnessInfo[]>([]);
  // Report named by the webview's current URL, or null on app home/dashboards.
  // State drives the label; the ref mirror lets the stable fetcher closure and
  // the navigation handler read the latest value without re-subscribing.
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const currentReportIdRef = useRef<string | null>(null);

  // Load the webview config (partition name) from main process
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

  // ----- Live data-freshness for the App view -----
  // Resolve this app's report list once. Each report keeps its own
  // dataset binding so the header can stamp the report CURRENTLY viewed
  // (tracked via the webview URL below); the deduped dataset list remains as
  // the aggregate fallback for app home / unknown-report URLs.
  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
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
        // Kick a freshness poll NOW that the dataset list exists. The hook's
        // mount poll and the webview's did-stop-loading poll can both fire
        // before this resolver returns (the webview emits did-stop-loading on
        // its first blank frame), and the next scheduled poll is 5 minutes
        // out — so without this, the App view shows "Data refreshed: —" for
        // minutes while reports populate instantly. Setting lastLoadAt also
        // (re)baselines newDataAvailable, which is correct: the on-screen
        // content was loaded at essentially this moment.
        if (datasets.length > 0) setLastLoadAt(Date.now());
      } catch (err) {
        console.warn('[AppViewer] Could not resolve app datasets for freshness:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Poll dataset + upstream-dataflow freshness. When the webview URL names a
  // known report, ask about that report's ONE dataset so the header shows the
  // per-report stamp Power BI itself displays; otherwise (app home, dashboard,
  // unknown report) fall back to the app-wide aggregate.
  const { datasetRefreshTime, dataflowRefreshTime, newDataAvailable } = useLiveFreshness(
    useCallback(async () => {
      const target = selectFreshnessTarget(
        currentReportIdRef.current,
        appReportsRef.current,
        datasetsRef.current,
      );
      const first = target.datasets[0];
      if (!first) return null;
      // Pass full {datasetId, workspaceId} PAIRS, not bare ids: an app's reports
      // can be bound to shared datasets living in other workspaces, and querying
      // them all under the first dataset's workspace 404s every refreshes call
      // (the "Data refreshed: —" forever bug). Each dataset is queried in its
      // own home workspace, with a groupless fallback for app-audience access.
      const r = await window.electronAPI.content.getDataFreshness(first.workspaceId, target.datasets);
      if (!r.success) return null;
      return {
        datasetRefreshTime: r.data.datasetRefreshTime,
        dataflowRefreshTime: r.data.dataflowRefreshTime,
      };
    }, []),
    lastLoadAt,
  );

  // Single-dataset mode (a known report is on screen) shows its exact stamp;
  // the aggregate fallback keeps the v2.2.10 "Oldest data" wording when the
  // stalest-of-many timestamp is what's displayed.
  const headerTarget = selectFreshnessTarget(
    currentReportId,
    appReportsRef.current,
    datasetsRef.current,
  );
  const isReportTargeted = headerTarget.mode === 'report';
  const freshnessLabel = isReportTargeted || datasetCount <= 1 ? 'Data refreshed' : 'Oldest data';
  // Owner-only targeting trace in the stamp's hover tooltip: when a stamp is
  // wrong, the same screenshot that reports it also says WHY (which report id
  // the webview URL named, which mode the poll used, what the map knew).
  const ownerEmail = useAuthStore((s) => s.user?.email);
  const freshnessDiagnostic =
    (ownerEmail ?? '').toLowerCase() === 'brendan@bc-abc.com'
      ? `url report: ${currentReportId ?? 'none (app home)'} · mode: ${headerTarget.mode} · app reports known: ${appReportsRef.current.length}`
      : null;

  useEffect(() => {
    if (error) reportIssue({ code: 'APP_WEBVIEW_ERROR', itemName: appName, context: error });
  }, [error, appName]);

  // Set up webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Load watchdog: if the top document never finishes (proxy stall, captive
    // portal, blocked TLS cert), the spinner would otherwise spin forever. Arm a
    // timer on load start; clear it on stop/fail; on fire, surface a recoverable
    // error (with the existing Try again button) instead of an eternal spinner.
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const handleDidStartLoading = () => {
      setIsLoading(true);
      // Clear any prior error the moment a (re)load begins. Without this, a
      // successful reload after a failed load renders the app behind a
      // permanent error overlay (the webview is only visibility:hidden, never
      // unmounted), so "Try again" appears to do nothing.
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
      // Mark when the on-screen content was (re)loaded so we can tell whether a
      // later dataset refresh has left the visuals behind.
      setLastLoadAt(Date.now());
    };

    const handleDidFailLoad = (event: Event) => {
      const e = event as CustomEvent;
      // Ignore aborted loads (e.g., navigating away)
      if (e.detail?.errorCode === -3) return;
      // Only a MAIN-FRAME failure means the app page itself didn't load. The
      // embedded Power BI app pulls dozens of sub-resources / sub-frames; a blip
      // in any of those (common on a cold first open, then cached on retry) fires
      // did-fail-load with isMainFrame=false. Treating those as fatal puts up a
      // spurious "Failed to load app" that then works on the second try.
      if (e.detail?.isMainFrame === false) return;
      clearWatchdog();
      console.error('[AppViewer] Webview failed to load:', e.detail);
      setError(`Failed to load app: ${e.detail?.errorDescription || 'Unknown error'}`);
      setIsLoading(false);
    };

    // If the embedded Power BI guest process crashes (OOM on a large app, GPU
    // fault), the webview goes blank with no error. Surface a recoverable error.
    const handleCrashed = () => {
      clearWatchdog();
      console.error('[AppViewer] Webview render process gone');
      setError('The app stopped unexpectedly. Click Try again to reload it.');
      setIsLoading(false);
    };

    // Track WHICH report inside the app is on screen via the webview URL
    // (https://app.powerbi.com/groups/me/apps/{appId}/reports/{reportId}/…).
    // Power BI's app shell is an SPA, so report switches usually arrive as
    // did-navigate-in-page; did-navigate covers full loads and redirects.
    const handleNavigation = (event: Event) => {
      const e = event as Event & { url?: string; isMainFrame?: boolean };
      // The PBI embed spawns sub-frames that navigate on their own; only the
      // main frame's URL says which report the user is viewing.
      if (e.isMainFrame === false) return;
      const reportId = parseReportIdFromUrl(e.url);
      if (reportId === currentReportIdRef.current) return;
      currentReportIdRef.current = reportId;
      setCurrentReportId(reportId);
      // Re-poll NOW so the stamp flips to the newly viewed report's dataset
      // instead of waiting up to 5 minutes for the next scheduled poll. Also
      // re-baselines newDataAvailable, which is correct: the content now on
      // screen was just (re)rendered for this report.
      setLastLoadAt(Date.now());
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('render-process-gone', handleCrashed);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);

    return () => {
      // Remove listeners FIRST so the about:blank navigation we kick off in a
      // moment doesn't fire `did-start-loading`/`did-stop-loading` into stale
      // setState calls on an about-to-unmount component (React 18 warns).
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
          // Drop the heavy SPA so Chromium GCs the guest process promptly.
          w.src = 'about:blank';
        }
      } catch (err) {
        console.warn('[AppViewer] Webview teardown failed (non-fatal):', err);
      }
    };
  }, [partitionLoaded]);

  // Refresh with in-progress state.
  // webview.reload() is synchronous, so clearing isRefreshing in a finally
  // block means React batches both state updates in the same tick and the
  // toolbar 'Refreshing…' label never actually renders. Instead we drive
  // isRefreshing from the webview's own loading lifecycle: set it true on
  // click and clear it when did-stop-loading fires. The did-stop-loading
  // listener registered in the effect above already calls setIsLoading(false),
  // but we need a separate gate so a background-load doesn't clear the flag
  // from a refresh that hasn't started yet. We use a ref to avoid adding
  // handleRefresh as a dep of the webview-listener effect.
  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    // Clear the error overlay immediately so the user gets feedback that the
    // retry took, and so a successful reload isn't hidden behind a stale error.
    setError(null);
    setIsLoading(true);
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    webview.reload();
  }, []);

  // Clear isRefreshing when the webview finishes loading after a manual refresh.
  // We watch isLoading (already driven by did-stop-loading) as a proxy for
  // completion. When isLoading transitions to false and a refresh was in flight,
  // clear the flag.
  useEffect(() => {
    if (!isRefreshingRef.current) return;
    if (isLoading) return; // still loading — wait for did-stop-loading
    isRefreshingRef.current = false;
    setIsRefreshing(false);
    // The webview finished reloading: confirm the repaint in the toolbar.
    setJustRefreshedAt(Date.now());
  }, [isLoading]);

  const handleBack = () => {
    navigate('/apps');
  };

  // Construct the full Power BI App URL
  const appUrl = appId ? `https://app.powerbi.com/groups/me/apps/${appId}` : '';

  return (
    <div className="h-full flex flex-col">
      {/* Sr-only heading for screen readers */}
      <h1 className="sr-only">App: {appName}</h1>

      {/* Shared toolbar */}
      <ViewerToolbar
        onBack={handleBack}
        backLabel="Back to Apps"
        itemName={appName}
        titleIcon={<AppsRegular />}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastDataRefresh={datasetRefreshTime}
        dataflowRefresh={dataflowRefreshTime}
        freshnessLabel={freshnessLabel}
        freshnessDiagnostic={freshnessDiagnostic}
        showRelativeAge
        showFreshness
        justRefreshedAt={justRefreshedAt}
        // Unlike ReportViewer (which suppresses the nudge when auto-refresh is on because it can
        // silently call report.refresh()), App embeds cannot be refreshed in place, so the "New
        // data" nudge is intentionally always shown here regardless of the auto-refresh setting.
        newDataAvailable={newDataAvailable}
      />

      {/* Content */}
      <div className="flex-1 relative">
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

        {/* Webview to load full Power BI App experience */}
        {/* Only render webview after partition name is loaded to ensure correct session */}
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
      </div>
    </div>
  );
};

export default AppViewer;
