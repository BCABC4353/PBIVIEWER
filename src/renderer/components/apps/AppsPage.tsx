/**
 * UX-S5: App tiles use flat ContentCard style — no bg-gradient-to-br.
 * Icon container replaced with bg-neutral-background-4.
 *
 * UX-S6: hover uses shadow-fluent-4.
 *
 * UX-S13: icon uses text-accent-primary (orange brand) instead of any
 * hard-coded purple-600 / amber-600 / raw white.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Text, Button, Card } from '@fluentui/react-components';
import {
  AppsRegular,
  ArrowSyncRegular,
  PersonRegular,
  CalendarRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import type { App } from '../../../shared/types';

export const AppsPage: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.content.getApps();

      if (!response.success) {
        throw new Error(response.error.userMessage || response.error.message || 'Failed to load apps');
      }

      setApps(response.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenApp = (app: App) => {
    navigate(`/app/${app.id}`);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      console.warn('[AppsPage] Date format failed:', error);
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <Text className="mt-4 text-neutral-foreground-2 block">
            Loading apps...
          </Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-status-error/10 border border-status-error rounded-lg p-4">
          <Text className="text-status-error">{error}</Text>
          <Button appearance="subtle" size="small" onClick={loadApps} className="mt-2">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-neutral-foreground-1">
            Apps
          </h1>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={loadApps}
          >
            Refresh
          </Button>
        </div>

        {apps.length === 0 ? (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <AppsRegular className="text-4xl text-neutral-foreground-3 mx-auto mb-4" />
            <Text className="text-neutral-foreground-3 block">
              No apps found. Apps published to you will appear here.
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <Card
                key={app.id}
                // UX-S6: shadow-fluent-4 on hover; UX-S5: no gradient
                className="cursor-pointer hover:shadow-fluent-4 transition-shadow"
                onClick={() => handleOpenApp(app)}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* UX-S5: flat neutral icon container — no gradient */}
                    <div className="w-14 h-14 bg-neutral-background-4 rounded-xl flex items-center justify-center flex-shrink-0">
                      {/* UX-S13: accent-primary (orange brand) instead of raw white-on-gradient */}
                      <AppsRegular className="text-2xl text-accent-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <Text weight="semibold" size={400} className="text-neutral-foreground-1 block truncate">
                        {app.name}
                      </Text>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-stroke-2">
                    <div className="flex flex-col gap-1 text-neutral-foreground-3">
                      <div className="flex items-center gap-2">
                        <PersonRegular className="text-sm" />
                        <Text size={200}>{app.publishedBy}</Text>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarRegular className="text-sm" />
                        <Text size={200}>{formatDate(app.lastUpdate)}</Text>
                      </div>
                    </div>

                    <Button
                      appearance="primary"
                      icon={<OpenRegular />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenApp(app);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppsPage;
