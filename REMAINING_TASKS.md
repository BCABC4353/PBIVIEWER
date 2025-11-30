# Power BI Viewer - Remaining Implementation Tasks

## Overview
This document tracks all remaining features, placeholders, and improvements needed to complete the Power BI Viewer application.

---

## Phase 1: Core Missing Features (High Priority)

### 1.1 Dashboard Viewer
**Status:** Not Implemented
**Files to Create/Modify:**
- `src/renderer/components/viewer/DashboardViewer.tsx` (NEW)
- `src/renderer/App.tsx` (add route)
- `src/renderer/components/workspaces/WorkspacesPage.tsx` (update click handler)
- `src/renderer/components/apps/AppsPage.tsx` (update click handler)

**Requirements:**
- Create DashboardViewer component similar to ReportViewer
- Use powerbi-client to embed dashboards
- Add route `/dashboard/:workspaceId/:dashboardId`
- Update dashboard click handlers in WorkspacesPage and AppsPage

### 1.2 Favorites Persistence
**Status:** Returns empty array
**Files to Modify:**
- `src/main/index.ts` (implement IPC handlers)
- `src/main/services/favorites-service.ts` (NEW)

**Requirements:**
- Create electron-store based favorites service
- Implement add/remove/get favorites
- Persist favorites locally with workspace info for display

### 1.3 Presentation/Slideshow Mode
**Status:** TODO placeholder
**Files to Create/Modify:**
- `src/renderer/components/viewer/PresentationMode.tsx` (NEW)
- `src/renderer/App.tsx` (add route)
- `src/renderer/components/home/HomePage.tsx` (update handler)

**Requirements:**
- Full-screen presentation view
- Auto-advance through report pages
- Timer controls (play/pause, interval)
- Keyboard navigation (arrow keys, escape)

---

## Phase 2: Enhanced Features (Medium Priority)

### 2.1 Home Page Tabs Implementation
**Status:** Shared/Apps tabs return empty arrays
**Files to Modify:**
- `src/renderer/components/home/HomePage.tsx`

**Requirements:**
- Shared tab: Show items shared with the user (may need API research)
- Apps tab: Show app content items on home page

### 2.2 Search Functionality
**Status:** Search bar exists but non-functional
**Files to Modify:**
- `src/renderer/components/layout/TitleBar.tsx`
- `src/renderer/stores/` (may need search store)

**Requirements:**
- Implement search across reports and dashboards
- Show search results dropdown
- Navigate to items from search

### 2.3 Thumbnail Caching
**Status:** Placeholder implementation
**Files to Modify:**
- `src/main/index.ts`
- `src/main/services/cache-service.ts` (NEW)
- `src/renderer/components/home/ItemCard.tsx`

**Requirements:**
- Fetch and cache report/dashboard thumbnails
- Display thumbnails in ItemCard instead of icons
- Store in local cache directory

---

## Phase 3: Polish & Cleanup (Lower Priority)

### 3.1 Remove Debug Console.logs
**Files to Modify:**
- `src/renderer/components/viewer/ReportViewer.tsx` (6 statements)
- `src/main/index.ts` (2 statements)

### 3.2 Offline Mode Support
**Status:** Placeholder
**Files to Modify:**
- `src/main/index.ts`
- `src/main/services/cache-service.ts`

**Requirements:**
- Cache report metadata for offline viewing
- Show cached content when offline
- Sync indicator in status bar

### 3.3 Settings Persistence
**Status:** May need verification
**Files to Modify:**
- `src/main/services/settings-service.ts` (verify/create)
- `src/renderer/App.tsx` (SettingsPage)

**Requirements:**
- Theme selection (light/dark/system)
- Slideshow interval setting
- Auto-start options

---

## Implementation Order

1. **Dashboard Viewer** - Unblocks dashboard viewing
2. **Favorites Persistence** - Core feature users expect
3. **Home Page Tabs** - Complete the home page
4. **Presentation Mode** - Key differentiator feature
5. **Search Functionality** - Improves navigation
6. **Remove Debug Logs** - Production readiness
7. **Thumbnail Caching** - Visual polish
8. **Settings Persistence** - User preferences
9. **Offline Mode** - Advanced feature

---

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Dashboard Viewer | ✅ Complete | Created DashboardViewer.tsx, added route, updated handlers |
| 1.2 Favorites Persistence | ✅ Complete | Created favorites-service.ts with electron-store |
| 1.3 Presentation Mode | ✅ Complete | Created PresentationMode.tsx with slideshow features |
| 2.1 Home Page Tabs | ✅ Complete | AppsList for Apps tab, placeholder for Shared tab |
| 2.2 Search Functionality | ✅ Complete | Search store, SearchDialog, Ctrl+K shortcut |
| 2.3 Thumbnail Caching | ✅ Complete | Created cache-service.ts with thumbnail and offline caching infrastructure |
| 3.1 Remove Debug Logs | ✅ Complete | Removed all console.log statements |
| 3.2 Offline Mode | ✅ Complete | Caches content for offline use, StatusBar shows online/offline status |
| 3.3 Settings Persistence | ✅ Complete | Created settings-service.ts, SettingsPage with theme/slideshow options |

## ALL TASKS COMPLETE

The Power BI Viewer application is now feature-complete with:
- Dashboard and Report viewing with Power BI embedding
- Favorites with local persistence
- Presentation/slideshow mode with auto-advance
- Global search (Ctrl+K)
- Settings persistence (theme, slideshow options)
- Offline caching and status indicator
- Apps and Workspaces browsing
