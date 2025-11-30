import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import { ArrowSyncRegular, PeopleRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';
import { FrequentStrip } from './FrequentStrip';
import { ContentTabs, TabValue } from './ContentTabs';
import { ItemList } from './ItemList';
import { AppsList } from './AppsList';
import type { ContentItem } from '../../../shared/types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    recentItems,
    frequentItems,
    allItems,
    favoriteItems,
    apps,
    isLoading,
    error,
    loadAllItems,
    loadRecentItems,
    loadFrequentItems,
    loadFavorites,
    loadApps,
    recordItemOpened,
    toggleFavorite,
    refreshAll,
    clearError,
  } = useContentStore();

  const [selectedTab, setSelectedTab] = useState<TabValue>('recent');

  useEffect(() => {
    loadAllItems();
    loadRecentItems();
    loadFrequentItems();
    loadFavorites();
    loadApps();
  }, [loadAllItems, loadRecentItems, loadFrequentItems, loadFavorites, loadApps]);

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

  const getCurrentTabItems = (): ContentItem[] => {
    switch (selectedTab) {
      case 'recent':
        // If user has opened items, show those; otherwise show all available items
        return recentItems.length > 0 ? recentItems : allItems;
      case 'favorites':
        return favoriteItems;
      case 'shared':
      case 'apps':
        // These tabs have special rendering, return empty
        return [];
      default:
        return [];
    }
  };

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'recent':
      case 'favorites':
        return (
          <ItemList
            items={getCurrentTabItems()}
            onOpen={handleOpenItem}
            onPresentationMode={handlePresentationMode}
            onToggleFavorite={handleToggleFavorite}
          />
        );
      case 'shared':
        return (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <PeopleRegular className="text-4xl text-neutral-foreground-3 mx-auto mb-4" />
            <Text className="text-neutral-foreground-3 block">
              Content shared with you will appear here.
            </Text>
            <Text size={200} className="text-neutral-foreground-4 block mt-2">
              This feature requires additional Power BI API permissions.
            </Text>
          </div>
        );
      case 'apps':
        return <AppsList apps={apps} />;
      default:
        return null;
    }
  };

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

            {/* Content tabs */}
            <ContentTabs
              selectedTab={selectedTab}
              onTabSelect={setSelectedTab}
              counts={{
                recent: recentItems.length > 0 ? recentItems.length : allItems.length,
                favorites: favoriteItems.length,
                apps: apps.length,
              }}
            />

            {/* Tab content */}
            <div className="mt-4">
              {renderTabContent()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
