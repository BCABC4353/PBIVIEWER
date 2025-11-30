import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text, Breadcrumb, BreadcrumbItem } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  FullScreenMaximizeRegular,
  HomeRegular,
  AppsRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import type { IPCResponse, EmbedToken, App, Report } from '../../../shared/types';

// Power BI service instance
const powerbi = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export const AppViewer: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const [embeddedReport, setEmbeddedReport] = useState<pbi.Report | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>('App');

  useEffect(() => {
    if (!appId) {
      setError('Invalid app parameters');
      setIsLoading(false);
      return;
    }

    loadApp();

    // Cleanup on unmount
    return () => {
      if (embedContainerRef.current) {
        powerbi.reset(embedContainerRef.current);
      }
    };
  }, [appId]);

  const loadApp = async () => {
    if (!appId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get app details to display the name
      const appResponse = await window.electronAPI.content.getApp(appId) as IPCResponse<App>;

      if (appResponse.success && appResponse.data) {
        setAppName(appResponse.data.name);
      }

      // Get the app's reports - we'll embed the first one as the app's landing page
      const reportsResponse = await window.electronAPI.content.getAppReports(appId) as IPCResponse<Report[]>;

      if (!reportsResponse.success || !reportsResponse.data || reportsResponse.data.length === 0) {
        throw new Error('This app has no reports to display');
      }

      const firstReport = reportsResponse.data[0];

      // Get the access token for embedding
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        firstReport.id,
        appId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get access token');
      }

      // Embed the report
      if (embedContainerRef.current) {
        const embedConfig: pbi.IReportEmbedConfiguration = {
          type: 'report',
          id: firstReport.id,
          embedUrl: firstReport.embedUrl,
          accessToken: tokenResponse.data.token,
          tokenType: pbi.models.TokenType.Aad,
          settings: {
            panes: {
              filters: {
                visible: true,
                expanded: false,
              },
              pageNavigation: {
                visible: true,
              },
            },
            background: pbi.models.BackgroundType.Default,
            navContentPaneEnabled: true,
          },
        };

        const report = powerbi.embed(embedContainerRef.current, embedConfig) as pbi.Report;
        setEmbeddedReport(report);

        // Handle loaded event
        report.on('loaded', () => {
          console.log('[AppViewer] Report loaded successfully');
          setIsLoading(false);
        });

        // Handle error event
        report.on('error', (event) => {
          console.error('[AppViewer] Report error:', event.detail);
          setError(`Error loading app: ${event.detail.message || 'Unknown error'}`);
          setIsLoading(false);
        });
      }

    } catch (err) {
      console.error('[AppViewer] Failed to load app:', err);
      setError(String(err));
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    if (embeddedReport) {
      embeddedReport.refresh();
    } else {
      loadApp();
    }
  };

  const handleFullScreen = async () => {
    if (embeddedReport) {
      try {
        await embeddedReport.fullscreen();
      } catch (err) {
        console.error('[AppViewer] Failed to enter fullscreen:', err);
      }
    }
  };

  const handleBack = () => {
    navigate('/apps');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 bg-neutral-background-2 border-b border-neutral-stroke-2 flex items-center px-4 gap-4">
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBack}
        >
          Back
        </Button>

        <div className="h-6 w-px bg-neutral-stroke-2" />

        <Breadcrumb aria-label="Breadcrumb">
          <BreadcrumbItem>
            <Button appearance="subtle" icon={<HomeRegular />} onClick={() => navigate('/')}>
              Home
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Button appearance="subtle" icon={<AppsRegular />} onClick={() => navigate('/apps')}>
              Apps
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Text>{appName}</Text>
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleRefresh}
            title="Refresh"
          />
          <Button
            appearance="subtle"
            icon={<FullScreenMaximizeRegular />}
            onClick={handleFullScreen}
            title="Full screen"
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
              <Button appearance="primary" onClick={loadApp}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Power BI Embed Container */}
        <div
          ref={embedContainerRef}
          className="w-full h-full"
        />
      </div>
    </div>
  );
};

export default AppViewer;
