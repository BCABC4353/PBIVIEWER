import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  AppsRegular,
} from '@fluentui/react-icons';

// Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
  partition?: string;
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
  const [partitionLoaded, setPartitionLoaded] = useState(false);

  // Load the partition name from main process
  useEffect(() => {
    const loadPartition = async () => {
      try {
        const partition = await window.electronAPI.app.getPartitionName();
        setPartitionName(partition);
      } catch (error) {
        console.warn('[AppViewer] Failed to load partition name:', error);
      } finally {
        setPartitionLoaded(true);
      }
    };
    loadPartition();
  }, []);

  useEffect(() => {
    if (!appId) {
      setError('Invalid app parameters');
      setIsLoading(false);
      return;
    }

    loadAppDetails();
  }, [appId]);

  // Set up webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidStartLoading = () => {
      setIsLoading(true);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
    };

    const handleDidFailLoad = (event: Event) => {
      const e = event as CustomEvent;
      // Ignore aborted loads (e.g., navigating away)
      if (e.detail?.errorCode === -3) return;
      console.error('[AppViewer] Webview failed to load:', e.detail);
      setError(`Failed to load app: ${e.detail?.errorDescription || 'Unknown error'}`);
      setIsLoading(false);
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      // Remove listeners FIRST so the about:blank navigation we kick off in a
      // moment doesn't fire `did-start-loading`/`did-stop-loading` into stale
      // setState calls on an about-to-unmount component (React 18 warns).
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
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

  const loadAppDetails = async () => {
    if (!appId) return;

    try {
      const appResponse = await window.electronAPI.content.getApp(appId);
      if (appResponse.success && appResponse.data) {
        setAppName(appResponse.data.name);
      }
    } catch (err) {
      console.error('[AppViewer] Failed to load app details:', err);
    }
  };

  const handleRefresh = () => {
    const webview = webviewRef.current;
    if (webview) {
      webview.reload();
    }
  };

  const handleBack = () => {
    navigate('/apps');
  };

  // Construct the full Power BI App URL
  const appUrl = appId ? `https://app.powerbi.com/groups/me/apps/${appId}` : '';

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 bg-neutral-background-2 border-b border-neutral-stroke-2 flex items-center px-4 gap-4">
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBack}
        >
          Back to Apps
        </Button>

        <div className="h-6 w-px bg-neutral-stroke-2" />

        <div className="flex items-center gap-2">
          <AppsRegular className="text-brand-primary" />
          <Text weight="semibold">{appName}</Text>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleRefresh}
            title="Refresh"
          />
        </div>
      </div>

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
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
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
            allowpopups={true}
          />
        )}
      </div>
    </div>
  );
};

export default AppViewer;
