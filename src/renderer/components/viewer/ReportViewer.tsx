import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner, Button, Text, Breadcrumb, BreadcrumbItem } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  FullScreenMaximizeRegular,
  StarRegular,
  StarFilled,
  HomeRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import type { IPCResponse, EmbedToken } from '../../../shared/types';

// Create a single instance of the Power BI service
const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<pbi.Report | null>(null);
  const isLoadingRef = useRef(false); // Prevent double-loading in Strict Mode

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportName, setReportName] = useState<string>('Report');
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (!workspaceId || !reportId) {
      setError('Invalid report parameters');
      setIsLoading(false);
      return;
    }

    // Prevent double-loading in React Strict Mode
    if (isLoadingRef.current) {
      return;
    }

    loadReport();

    return () => {
      // Cleanup: reset the container to allow fresh embed
      if (embedContainerRef.current) {
        powerbiService.reset(embedContainerRef.current);
      }
      reportRef.current = null;
      isLoadingRef.current = false;
    };
  }, [workspaceId, reportId]);

  const loadReport = async () => {
    if (!embedContainerRef.current || !workspaceId || !reportId) return;

    // Prevent double-loading
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      // Reset any existing embed first
      powerbiService.reset(embedContainerRef.current);

      // Get embed token
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        reportId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get embed token');
      }

      const token = tokenResponse.data.token;

      // Configure embed settings
      const embedConfig: pbi.IReportEmbedConfiguration = {
        type: 'report',
        id: reportId,
        embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`,
        accessToken: token,
        tokenType: pbi.models.TokenType.Aad, // Using AAD token for user-owns-data
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

      // Embed the report
      const report = powerbiService.embed(
        embedContainerRef.current,
        embedConfig
      ) as pbi.Report;

      reportRef.current = report;

      // Handle loaded event
      report.on('loaded', () => {
        setIsLoading(false);
      });

      // Handle error event
      report.on('error', (event) => {
        console.error('[ReportViewer] Report error:', event);
        setError('Failed to load report. Please try again.');
        setIsLoading(false);
      });

    } catch (err) {
      console.error('[ReportViewer] Failed to load report:', err);
      setError(String(err));
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    if (reportRef.current) {
      reportRef.current.refresh();
    } else {
      isLoadingRef.current = false; // Allow reload
      loadReport();
    }
  };

  const handleFullScreen = () => {
    if (reportRef.current) {
      reportRef.current.fullscreen();
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleToggleFavorite = async () => {
    if (!reportId) return;

    if (isFavorite) {
      await window.electronAPI.content.removeFavorite(reportId);
    } else {
      await window.electronAPI.content.addFavorite(reportId, 'report');
    }
    setIsFavorite(!isFavorite);
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
            <Text>{reportName}</Text>
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
            icon={isFavorite ? <StarFilled className="text-brand-primary" /> : <StarRegular />}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
                Loading report...
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

export default ReportViewer;
