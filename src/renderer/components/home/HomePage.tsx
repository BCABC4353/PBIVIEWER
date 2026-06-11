import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  FolderRegular,
  SignOutRegular,
  BuildingRegular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';
import { FrequentStrip } from './FrequentStrip';
import { ItemList } from './ItemList';
import type { ContentItem, Workspace } from '../../../shared/types';

interface FeaturedWorkspacesStripProps {
  workspaces: Workspace[];
  isLoading: boolean;
  onOpenWorkspace: (workspaceId: string) => void;
}

const FeaturedWorkspacesStrip: React.FC<FeaturedWorkspacesStripProps> = ({
  workspaces,
  isLoading,
  onOpenWorkspace,
}) => {
  const featured = workspaces.slice(0, 3);

  return (
    <section aria-labelledby="featured-workspaces-heading" className="mb-6">
      {}
      <h2
        id="featured-workspaces-heading"
        className="text-base font-semibold text-neutral-foreground-1 mb-3"
      >
        Featured Workspaces
      </h2>

      {isLoading && featured.length === 0 ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 bg-neutral-background-3 rounded-lg h-16 animate-pulse"
            />
          ))}
        </div>
      ) : featured.length > 0 ? (
        <div className="flex gap-3">
          {featured.map((ws) => (
            <button
              key={ws.id}
              type="button"
              className="flex-1 flex items-center gap-2 bg-neutral-background-3 hover:bg-neutral-background-4 rounded-lg px-4 py-3 text-left transition-colors cursor-pointer"
              onClick={() => onOpenWorkspace(ws.id)}
              aria-label={`Open workspace ${ws.name}`}
            >
              <BuildingRegular className="text-brand-primary shrink-0" />
              <Text className="text-neutral-foreground-1 truncate font-medium" title={ws.name}>
                {ws.name}
              </Text>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-neutral-background-3 rounded-lg px-4 py-3">
          <Text className="text-neutral-foreground-3">
            No workspaces loaded yet — use Browse Workspaces below.
          </Text>
        </div>
      )}
    </section>
  );
};

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const {
    recentItems,
    frequentItems,
    workspaces,
    loadRecentItems,
    loadFrequentItems,
    loadWorkspaces,
    recordItemOpened,
    clearError,
  } = useContentStore();

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadRecentItems(), loadFrequentItems(), loadWorkspaces()]);
      setIsLoading(false);
    };
    loadData();
  }, [loadRecentItems, loadFrequentItems, loadWorkspaces]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleOpenItem = (item: ContentItem) => {
    recordItemOpened(item);
    if (item.type === 'dashboard') {
      navigate(`/dashboard/${item.workspaceId}/${item.id}`);
    } else {
      navigate(`/report/${item.workspaceId}/${item.id}`);
    }
  };

  const handlePresentationMode = (item: ContentItem) => {
    recordItemOpened(item);
    navigate(`/presentation/${item.workspaceId}/${item.id}`);
  };

  const handleRefresh = async () => {
    clearError();
    setIsLoading(true);
    await Promise.all([loadRecentItems(), loadFrequentItems(), loadWorkspaces()]);
    setIsLoading(false);
  };

  const hasUsageData = recentItems.length > 0 || frequentItems.length > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        {}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-foreground-1 mb-1">
              {getGreeting()}, {user?.displayName?.split(' ')[0] || 'User'}
            </h1>
            <Text className="text-neutral-foreground-2">
              Access your Power BI reports and dashboards
            </Text>
          </div>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {}
        <div className="flex items-center justify-between mb-4">
          <FeaturedWorkspacesStrip
            workspaces={workspaces}
            isLoading={isLoading}
            onOpenWorkspace={(workspaceId) => navigate(`/workspaces?expand=${workspaceId}`)}
          />
        </div>

        {}
        <div className="mb-6">
          <Button
            appearance="primary"
            icon={<FolderRegular />}
            onClick={() => navigate('/workspaces')}
            data-testid="browse-workspaces-cta"
          >
            Browse Workspaces
          </Button>
        </div>

        {}
        {isLoading && !hasUsageData && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="large" label="Loading content..." />
          </div>
        )}

        {}
        {!isLoading && !hasUsageData && (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <FolderRegular className="text-4xl text-brand-primary mx-auto mb-4" />
            <Text as="p" block weight="semibold" size={400} className="text-neutral-foreground-1 mb-2">
              Welcome to Power BI Viewer
            </Text>
            <Text as="p" block className="text-neutral-foreground-3 mb-1">
              Browse your workspaces to start viewing reports and dashboards.
              Items you open will appear here for quick access.
            </Text>
            {user?.email && (
              <Text as="p" block size={200} className="text-neutral-foreground-3 mb-4">
                Signed in as {user.email}
              </Text>
            )}
            <Button
              appearance="subtle"
              icon={<SignOutRegular />}
              onClick={() => void logout()}
              className="mt-2"
            >
              Sign out
            </Button>
          </div>
        )}

        {}
        {hasUsageData && (
          <>
            {}
            {frequentItems.length > 0 && (
              <FrequentStrip
                items={frequentItems}
                isLoading={isLoading}
                onOpen={handleOpenItem}
                onPresentationMode={handlePresentationMode}
              />
            )}

            {}
            {frequentItems.length > 0 && recentItems.length > 0 && (
              <div className="border-t border-neutral-stroke-2 my-6" />
            )}

            {}
            {recentItems.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4">
                  {}
                  <h2 className="text-base font-semibold text-neutral-foreground-1">
                    Recent
                  </h2>
                  <Text size={200} className="text-neutral-foreground-3">
                    {recentItems.length} item{recentItems.length === 1 ? '' : 's'}
                  </Text>
                </div>
                <ItemList
                  items={recentItems}
                  onOpen={handleOpenItem}
                  onPresentationMode={handlePresentationMode}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
