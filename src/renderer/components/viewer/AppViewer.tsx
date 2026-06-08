import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { AppsRegular } from '@fluentui/react-icons';
import { ViewerToolbar } from './ViewerToolbar';
import { EMBED } from '../../../shared/constants';

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
    };

    const handleDidFailLoad = (event: Event) => {
      const e = event as CustomEvent;
      // Ignore aborted loads (e.g., navigating away)
      if (e.detail?.errorCode === -3) return;
      // Only a MAIN-FRAME failure means the app page itself didn't load. The
      // embedded Power BI app pulls dozens of sub-resources / sub-frames; a blip
      // in any of those (common on a cold first open, then cached on retry) fires
      // did-fail-load with isMainFrame=false. Treating those as fatal is what put
      // up a spurious "Failed to load app" that then worked on the second try.
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

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('crashed', handleCrashed);
    webview.addEventListener('render-process-gone', handleCrashed);

    return () => {
      // Remove listeners FIRST so the about:blank navigation we kick off in a
      // moment doesn't fire `did-start-loading`/`did-stop-loading` into stale
      // setState calls on an about-to-unmount component (React 18 warns).
      clearWatchdog();
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('crashed', handleCrashed);
      webview.removeEventListener('render-process-gone', handleCrashed);
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

  // NEW-UX-3: refresh with in-progress state.
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
  }, [isLoading]);

  const handleBack = () => {
    navigate('/apps');
  };

  // Construct the full Power BI App URL
  const appUrl = appId ? `https://app.powerbi.com/groups/me/apps/${appId}` : '';

  return (
    <div className="h-full flex flex-col">
      {/* A11Y-S7: sr-only heading for screen readers */}
      <h1 className="sr-only">App: {appName}</h1>

      {/* UX-B4: shared toolbar */}
      <ViewerToolbar
        onBack={handleBack}
        backLabel="Back to Apps"
        itemName={appName}
        titleIcon={<AppsRegular />}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
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
