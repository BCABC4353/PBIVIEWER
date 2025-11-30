import Store from 'electron-store';
import type { IPCResponse, ContentItem } from '../../shared/types';

interface CacheMetadata {
  offlineContent: ContentItem[];
  lastSync: number;
}

const store = new Store<CacheMetadata>({
  name: 'cache-metadata',
  defaults: {
    offlineContent: [],
    lastSync: 0,
  },
});

export const cacheService = {
  async cacheOfflineContent(items: ContentItem[]): Promise<IPCResponse<void>> {
    try {
      store.set('offlineContent', items);
      store.set('lastSync', Date.now());
      return { success: true };
    } catch (error) {
      console.error('[CacheService] cacheOfflineContent error:', error);
      return {
        success: false,
        error: { code: 'CACHE_OFFLINE_FAILED', message: String(error) },
      };
    }
  },

  getOfflineContent(): IPCResponse<ContentItem[]> {
    try {
      const content = store.get('offlineContent', []);
      return { success: true, data: content };
    } catch (error) {
      console.error('[CacheService] getOfflineContent error:', error);
      return {
        success: false,
        error: { code: 'GET_OFFLINE_FAILED', message: String(error) },
      };
    }
  },

  getLastSyncTime(): IPCResponse<number> {
    try {
      const lastSync = store.get('lastSync', 0);
      return { success: true, data: lastSync };
    } catch (error) {
      console.error('[CacheService] getLastSyncTime error:', error);
      return { success: true, data: 0 };
    }
  },

  clearCache(): IPCResponse<void> {
    try {
      store.set('offlineContent', []);
      store.set('lastSync', 0);
      return { success: true };
    } catch (error) {
      console.error('[CacheService] clearCache error:', error);
      return {
        success: false,
        error: { code: 'CLEAR_CACHE_FAILED', message: String(error) },
      };
    }
  },

  getCacheStats(): IPCResponse<{ offlineItemCount: number; lastSync: number }> {
    try {
      const offlineContent = store.get('offlineContent', []);
      const lastSync = store.get('lastSync', 0);

      return {
        success: true,
        data: {
          offlineItemCount: offlineContent.length,
          lastSync,
        },
      };
    } catch (error) {
      console.error('[CacheService] getCacheStats error:', error);
      return {
        success: false,
        error: { code: 'GET_STATS_FAILED', message: String(error) },
      };
    }
  },
};
