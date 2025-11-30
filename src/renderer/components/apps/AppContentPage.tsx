import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Spinner,
  Text,
  Button,
  Card,
  Tab,
  TabList,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  DocumentRegular,
  BoardRegular,
  AppsRegular,
  HomeRegular,
} from '@fluentui/react-icons';
import type { App, Report, Dashboard, IPCResponse } from '../../../shared/types';

export const AppContentPage: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<App | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'reports' | 'dashboards'>('reports');

  useEffect(() => {
    if (appId) {
      loadAppContent();
    }
  }, [appId]);

  const loadAppContent = async () => {
    if (!appId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load app details, reports, and dashboards in parallel
      const [appResponse, reportsResponse, dashboardsResponse] = await Promise.all([
        window.electronAPI.content.getApp(appId) as Promise<IPCResponse<App>>,
        window.electronAPI.content.getAppReports(appId) as Promise<IPCResponse<Report[]>>,
        window.electronAPI.content.getAppDashboards(appId) as Promise<IPCResponse<Dashboard[]>>,
      ]);

      if (appResponse.success && appResponse.data) {
        setApp(appResponse.data);
      }

      if (reportsResponse.success && reportsResponse.data) {
        setReports(reportsResponse.data);
      }

      if (dashboardsResponse.success && dashboardsResponse.data) {
        setDashboards(dashboardsResponse.data);
      }

      // Default to dashboards tab if no reports but has dashboards
      if ((!reportsResponse.data || reportsResponse.data.length === 0) &&
          dashboardsResponse.data && dashboardsResponse.data.length > 0) {
        setActiveTab('dashboards');
      }

    } catch (err) {
      console.error('[AppContentPage] Failed to load app content:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportClick = (report: Report) => {
    // Navigate to app report viewer with app context
    navigate(`/app/${appId}/report/${report.id}`);
  };

  const handleDashboardClick = (dashboard: Dashboard) => {
    // Navigate to app dashboard viewer with app context
    navigate(`/app/${appId}/dashboard/${dashboard.id}`);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <Text className="mt-4 text-neutral-foreground-2 block">
            Loading app content...
          </Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Text className="text-status-error block mb-4">{error}</Text>
          <Button appearance="primary" onClick={loadAppContent}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-neutral-stroke-2">
        <div className="flex items-center gap-4 mb-4">
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate('/apps')}
          >
            Back to Apps
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center">
            <AppsRegular className="text-2xl text-white" />
          </div>
          <div>
            <Text size={500} weight="semibold" className="text-neutral-foreground-1 block">
              {app?.name || 'App'}
            </Text>
            {app?.description && (
              <Text size={300} className="text-neutral-foreground-3 block mt-1">
                {app.description}
              </Text>
            )}
            <Text size={200} className="text-neutral-foreground-3 block mt-1">
              Published by {app?.publishedBy}
            </Text>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 border-b border-neutral-stroke-2">
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as 'reports' | 'dashboards')}
        >
          <Tab value="reports" icon={<DocumentRegular />}>
            Reports ({reports.length})
          </Tab>
          <Tab value="dashboards" icon={<BoardRegular />}>
            Dashboards ({dashboards.length})
          </Tab>
        </TabList>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'reports' && (
          <>
            {reports.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-neutral-foreground-3">
                <Text>This app has no reports</Text>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((report) => (
                  <Card
                    key={report.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleReportClick(report)}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DocumentRegular className="text-xl text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Text weight="semibold" className="text-neutral-foreground-1 block truncate">
                            {report.name}
                          </Text>
                          <Text size={200} className="text-neutral-foreground-3 block">
                            {report.reportType === 'PaginatedReport' ? 'Paginated Report' : 'Power BI Report'}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'dashboards' && (
          <>
            {dashboards.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-neutral-foreground-3">
                <Text>This app has no dashboards</Text>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboards.map((dashboard) => (
                  <Card
                    key={dashboard.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleDashboardClick(dashboard)}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BoardRegular className="text-xl text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Text weight="semibold" className="text-neutral-foreground-1 block truncate">
                            {dashboard.name}
                          </Text>
                          <Text size={200} className="text-neutral-foreground-3 block">
                            Dashboard
                          </Text>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AppContentPage;
