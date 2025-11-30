import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';
import { authService } from '../auth/auth-service';
import type { IPCResponse, ContentItem } from '../../shared/types';

interface CacheMetadata {
  thumbnails: Record<string, { path: string; timestamp: number }>;
  offlineContent: ContentItem[];
  lastSync: number;
}

const THUMBNAIL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
const THUMBNAILS_DIR = path.join(CACHE_DIR, 'thumbnails');

// Ensure cache directories exist
function ensureCacheDirectories() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

const store = new Store<CacheMetadata>({
  name: 'cache-metadata',
  defaults: {
    thumbnails: {},
    offlineContent: [],
    lastSync: 0,
  },
});

export const cacheService = {
  /**
   * Get thumbnail for a report or dashboard.
   *
   * KNOWN LIMITATION: Power BI REST API does not provide a direct endpoint for
   * report/dashboard thumbnails. The only ways to get thumbnails would be:
   * 1. Use the Export API to export a page as an image (requires Premium capacity)
   * 2. Embed the report and capture a screenshot programmatically
   *
   * Both approaches have significant complexity and requirements. For now,
   * this function returns null and the UI shows placeholder icons instead.
   * This is a deliberate design decision, not a bug.
   */
  async getThumbnail(itemId: string, itemType: 'report' | 'dashboard', workspaceId: string): Promise<IPCResponse<string | null>> {
    try {
      ensureCacheDirectories();

      // Check if we have a cached thumbnail
      const thumbnails = store.get('thumbnails', {});
      const cached = thumbnails[itemId];

      if (cached && Date.now() - cached.timestamp < THUMBNAIL_CACHE_DURATION) {
        // Return cached thumbnail as base64 data URL
        if (fs.existsSync(cached.path)) {
          const imageBuffer = fs.readFileSync(cached.path);
          const base64 = imageBuffer.toString('base64');
          return { success: true, data: `data:image/png;base64,${base64}` };
        }
      }

      // Power BI REST API does not have a thumbnail endpoint.
      // Returning null causes the UI to show placeholder icons.
      return { success: true, data: null };
    } catch (error) {
      console.error('[CacheService] getThumbnail error:', error);
      return { success: true, data: null };
    }
  },

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
      // Clear metadata
      store.set('thumbnails', {});
      store.set('offlineContent', []);
      store.set('lastSync', 0);

      // Clear thumbnail files
      if (fs.existsSync(THUMBNAILS_DIR)) {
        const files = fs.readdirSync(THUMBNAILS_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(THUMBNAILS_DIR, file));
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[CacheService] clearCache error:', error);
      return {
        success: false,
        error: { code: 'CLEAR_CACHE_FAILED', message: String(error) },
      };
    }
  },

  getCacheStats(): IPCResponse<{ thumbnailCount: number; offlineItemCount: number; lastSync: number }> {
    try {
      const thumbnails = store.get('thumbnails', {});
      const offlineContent = store.get('offlineContent', []);
      const lastSync = store.get('lastSync', 0);

      return {
        success: true,
        data: {
          thumbnailCount: Object.keys(thumbnails).length,
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
