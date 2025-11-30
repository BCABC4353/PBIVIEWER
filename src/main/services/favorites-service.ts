import Store from 'electron-store';
import type { IPCResponse } from '../../shared/types';

interface FavoriteItem {
  id: string;
  type: 'report' | 'dashboard';
  name?: string;
  workspaceId?: string;
  workspaceName?: string;
  addedAt: string;
}

interface FavoritesStore {
  favorites: FavoriteItem[];
}

const store = new Store<FavoritesStore>({
  name: 'favorites',
  defaults: {
    favorites: [],
  },
});

class FavoritesService {
  getFavorites(): IPCResponse<FavoriteItem[]> {
    try {
      const favorites = store.get('favorites', []);
      return { success: true, data: favorites };
    } catch (error) {
      console.error('[FavoritesService] getFavorites error:', error);
      return {
        success: false,
        error: { code: 'GET_FAVORITES_FAILED', message: String(error) },
      };
    }
  }

  addFavorite(
    itemId: string,
    itemType: 'report' | 'dashboard',
    name?: string,
    workspaceId?: string,
    workspaceName?: string
  ): IPCResponse<FavoriteItem> {
    try {
      const favorites = store.get('favorites', []);

      // Check if already exists
      const existing = favorites.find((f) => f.id === itemId);
      if (existing) {
        return { success: true, data: existing };
      }

      const newFavorite: FavoriteItem = {
        id: itemId,
        type: itemType,
        name,
        workspaceId,
        workspaceName,
        addedAt: new Date().toISOString(),
      };

      favorites.push(newFavorite);
      store.set('favorites', favorites);

      return { success: true, data: newFavorite };
    } catch (error) {
      console.error('[FavoritesService] addFavorite error:', error);
      return {
        success: false,
        error: { code: 'ADD_FAVORITE_FAILED', message: String(error) },
      };
    }
  }

  removeFavorite(itemId: string): IPCResponse<boolean> {
    try {
      const favorites = store.get('favorites', []);
      const filtered = favorites.filter((f) => f.id !== itemId);
      store.set('favorites', filtered);

      return { success: true, data: true };
    } catch (error) {
      console.error('[FavoritesService] removeFavorite error:', error);
      return {
        success: false,
        error: { code: 'REMOVE_FAVORITE_FAILED', message: String(error) },
      };
    }
  }

  isFavorite(itemId: string): IPCResponse<boolean> {
    try {
      const favorites = store.get('favorites', []);
      const exists = favorites.some((f) => f.id === itemId);
      return { success: true, data: exists };
    } catch (error) {
      console.error('[FavoritesService] isFavorite error:', error);
      return {
        success: false,
        error: { code: 'CHECK_FAVORITE_FAILED', message: String(error) },
      };
    }
  }

  clearFavorites(): IPCResponse<boolean> {
    try {
      store.set('favorites', []);
      return { success: true, data: true };
    } catch (error) {
      console.error('[FavoritesService] clearFavorites error:', error);
      return {
        success: false,
        error: { code: 'CLEAR_FAVORITES_FAILED', message: String(error) },
      };
    }
  }
}

export const favoritesService = new FavoritesService();
export type { FavoriteItem };
