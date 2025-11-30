import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text, Breadcrumb, BreadcrumbItem } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  FullScreenMaximizeRegular,
  HomeRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import type { IPCResponse, EmbedToken, Dashboard } from '../../../shared/types';

// Create a single instance of the Power BI service
const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export const DashboardViewer: React.FC = () => {
  const { workspaceId, dashboardId } = useParams<{ workspaceId: string; dashboardId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<pbi.Dashboard | null>(null);
  const isLoadingRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState<string>('Dashboard');

  // Fetch dashboard details to get the name
  useEffect(() => {
    if (!workspaceId || !dashboardId) return;

    const loadDashboardDetails = async () => {
      const response = await window.electronAPI.content.getDashboard(
        workspaceId,
        dashboardId
      ) as IPCResponse<Dashboard>;
      if (response.success && response.data) {
        setDashboardName(response.data.name);
      }
    };
    loadDashboardDetails();
  }, [workspaceId, dashboardId]);

  useEffect(() => {
    if (!workspaceId || !dashboardId) {
      setError('Invalid dashboard parameters');
      setIsLoading(false);
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    loadDashboard();

    return () => {
      if (embedContainerRef.current) {
        powerbiService.reset(embedContainerRef.current);
      }
      dashboardRef.current = null;
      isLoadingRef.current = false;
    };
  }, [workspaceId, dashboardId]);

  const loadDashboard = async () => {
    if (!embedContainerRef.current || !workspaceId || !dashboardId) return;

    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      powerbiService.reset(embedContainerRef.current);

      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        dashboardId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get embed token');
      }

      const token = tokenResponse.data.token;

      const embedConfig: pbi.IDashboardEmbedConfiguration = {
        type: 'dashboard',
        id: dashboardId,
        embedUrl: `https://app.powerbi.com/dashboardEmbed?dashboardId=${dashboardId}&groupId=${workspaceId}`,
        accessToken: token,
        tokenType: pbi.models.TokenType.Aad,
        pageView: 'fitToWidth',
      };

      const dashboard = powerbiService.embed(
        embedContainerRef.current,
        embedConfig
      ) as pbi.Dashboard;

      dashboardRef.current = dashboard;

      dashboard.on('loaded', () => {
        setIsLoading(false);
      });

      dashboard.on('error', (event) => {
        console.error('[DashboardViewer] Dashboard error:', event);
        setError('Failed to load dashboard. Please try again.');
        setIsLoading(false);
      });

      dashboard.on('tileClicked', (event) => {
        const tileEvent = event.detail as { reportEmbedUrl?: string; reportId?: string };
        if (tileEvent.reportId) {
          navigate(`/report/${workspaceId}/${tileEvent.reportId}`);
        }
      });

    } catch (err) {
      console.error('[DashboardViewer] Failed to load dashboard:', err);
      setError(String(err));
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    isLoadingRef.current = false;
    loadDashboard();
  };

  const handleFullScreen = () => {
    if (embedContainerRef.current) {
      if (embedContainerRef.current.requestFullscreen) {
        embedContainerRef.current.requestFullscreen();
      }
    }
  };

  const handleBack = () => {
    navigate('/');
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
            <Button appearance="subtle" icon={<HomeRegular />} onClick={handleBack}>
              Home
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Text>{dashboardName}</Text>
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

      {/* Embed container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center">
              <Spinner size="large" />
              <Text className="mt-4 text-neutral-foreground-2 block">
                Loading dashboard...
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

        <div
          ref={embedContainerRef}
          className="w-full h-full"
          style={{ visibility: isLoading || error ? 'hidden' : 'visible' }}
        />
      </div>
    </div>
  );
};

export default DashboardViewer;
