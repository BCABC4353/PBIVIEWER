import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { ArrowSyncRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';
import { FrequentStrip } from './FrequentStrip';
import { ItemList } from './ItemList';
import type { ContentItem } from '../../../shared/types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    recentItems,
    frequentItems,
    allItems,
    isLoading,
    error,
    loadAllItems,
    loadRecentItems,
    loadFrequentItems,
    recordItemOpened,
    toggleFavorite,
    refreshAll,
    clearError,
  } = useContentStore();

  useEffect(() => {
    loadAllItems();
    loadRecentItems();
    loadFrequentItems();
  }, [loadAllItems, loadRecentItems, loadFrequentItems]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleOpenItem = async (item: ContentItem) => {
    // Record that this item was opened
    await recordItemOpened(item);
    navigate(`/report/${item.workspaceId}/${item.id}`);
  };

  const handlePresentationMode = async (item: ContentItem) => {
    // Record that this item was opened
    await recordItemOpened(item);
    navigate(`/presentation/${item.workspaceId}/${item.id}`);
  };

  const handleToggleFavorite = async (item: ContentItem) => {
    await toggleFavorite(item.id, item.type);
  };

  const handleRefresh = async () => {
    clearError();
    await refreshAll();
  };

  const recentContent: ContentItem[] =
    recentItems.length > 0 ? recentItems : allItems;

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

        {/* Error state */}
        {error && (
          <div className="bg-status-error/10 border border-status-error rounded-lg p-4 mb-6">
            <Text className="text-status-error">{error}</Text>
            <Button
              appearance="subtle"
              size="small"
              onClick={handleRefresh}
              className="mt-2"
            >
              Try again
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && allItems.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="large" label="Loading content..." />
          </div>
        )}

        {/* Content */}
        {!isLoading && allItems.length === 0 && !error && (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <Text className="text-neutral-foreground-3">
              No reports or dashboards found. Make sure you have access to Power BI content.
            </Text>
          </div>
        )}

        {allItems.length > 0 && (
          <>
            {/* Frequent strip - shows most opened items, or all items if no usage yet */}
            <FrequentStrip
              items={frequentItems.length > 0 ? frequentItems : allItems}
              isLoading={isLoading}
              onOpen={handleOpenItem}
              onPresentationMode={handlePresentationMode}
              onToggleFavorite={handleToggleFavorite}
            />

            {/* Divider */}
            <div className="border-t border-neutral-stroke-2 my-6" />

            {/* Recent content */}
            <div className="flex items-center justify-between mb-4">
              <Text weight="semibold" size={400} className="text-neutral-foreground-1">
                Recent
              </Text>
              <Text size={200} className="text-neutral-foreground-3">
                {recentContent.length} item{recentContent.length === 1 ? '' : 's'}
              </Text>
            </div>
            <ItemList
              items={recentContent}
              onOpen={handleOpenItem}
              onPresentationMode={handlePresentationMode}
              onToggleFavorite={handleToggleFavorite}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
