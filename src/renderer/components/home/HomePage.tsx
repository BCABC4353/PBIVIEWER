import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { ArrowSyncRegular, FolderRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';
import { FrequentStrip } from './FrequentStrip';
import { ItemList } from './ItemList';
import type { ContentItem } from '../../../shared/types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const {
    recentItems,
    frequentItems,
    loadRecentItems,
    loadFrequentItems,
    recordItemOpened,
    clearError,
  } = useContentStore();

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadRecentItems(), loadFrequentItems()]);
      setIsLoading(false);
    };
    loadData();
  }, [loadRecentItems, loadFrequentItems]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleOpenItem = async (item: ContentItem) => {
    // Record that this item was opened
    await recordItemOpened(item);
    // Route based on item type
    if (item.type === 'dashboard') {
      navigate(`/dashboard/${item.workspaceId}/${item.id}`);
    } else {
      navigate(`/report/${item.workspaceId}/${item.id}`);
    }
  };

  const handlePresentationMode = async (item: ContentItem) => {
    // Record that this item was opened
    await recordItemOpened(item);
    navigate(`/presentation/${item.workspaceId}/${item.id}`);
  };

  const handleRefresh = async () => {
    clearError();
    setIsLoading(true);
    await Promise.all([loadRecentItems(), loadFrequentItems()]);
    setIsLoading(false);
  };

  const hasUsageData = recentItems.length > 0 || frequentItems.length > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
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

        {/* Loading state */}
        {isLoading && !hasUsageData && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="large" label="Loading content..." />
          </div>
        )}

        {/* Get started state - no usage history yet */}
        {!isLoading && !hasUsageData && (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <FolderRegular className="text-4xl text-brand-primary mx-auto mb-4" />
            <Text weight="semibold" size={400} className="text-neutral-foreground-1 block mb-2">
              Welcome to Power BI Viewer
            </Text>
            <Text className="text-neutral-foreground-3 block mb-4">
              Browse your workspaces to start viewing reports and dashboards.
              Items you open will appear here for quick access.
            </Text>
            <Button
              appearance="primary"
              icon={<FolderRegular />}
              onClick={() => navigate('/workspaces')}
            >
              Browse Workspaces
            </Button>
          </div>
        )}

        {/* Content - show when user has usage history */}
        {hasUsageData && (
          <>
            {/* Frequent strip - shows most opened items */}
            {frequentItems.length > 0 && (
              <FrequentStrip
                items={frequentItems}
                isLoading={isLoading}
                onOpen={handleOpenItem}
                onPresentationMode={handlePresentationMode}
              />
            )}

            {/* Divider */}
            {frequentItems.length > 0 && recentItems.length > 0 && (
              <div className="border-t border-neutral-stroke-2 my-6" />
            )}

            {/* Recent content */}
            {recentItems.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <Text weight="semibold" size={400} className="text-neutral-foreground-1">
                    Recent
                  </Text>
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
