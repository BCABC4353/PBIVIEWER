import React, { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from './stores/auth-store';
import { LoginScreen } from './components/auth/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './components/home/HomePage';
import { ReportViewer } from './components/viewer/ReportViewer';
import { DashboardViewer } from './components/viewer/DashboardViewer';
import { PresentationMode } from './components/viewer/PresentationMode';
import { AppViewer } from './components/viewer/AppViewer';
import { WorkspacesPage } from './components/workspaces/WorkspacesPage';
import { AppsPage } from './components/apps/AppsPage';
import { SearchDialog } from './components/search/SearchDialog';
import { SettingsPage } from './components/settings/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';

// Loading screen
const LoadingScreen: React.FC = () => (
  <div className="h-screen flex items-center justify-center bg-neutral-background-2">
    <div className="text-center">
      <Spinner size="large" />
      <p className="mt-4 text-neutral-foreground-2">Loading...</p>
    </div>
  </div>
);

/** Map pathname to a human-readable route title for the aria-live announcer. */
function getRouteTitle(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname === '/workspaces') return 'Workspaces';
  if (pathname === '/apps') return 'Apps';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/login') return 'Sign in';
  if (pathname.startsWith('/report/')) return 'Report';
  if (pathname.startsWith('/dashboard/')) return 'Dashboard';
  if (pathname.startsWith('/presentation/')) return 'Presentation';
  if (pathname.startsWith('/app/')) return 'App';
  return 'Power BI Viewer';
}

/**
 * NEW-A11Y-1: on every route change —
 *   1. Move focus to the main content region (id="main-content") so keyboard
 *      users are not stranded at whatever element triggered navigation.
 *   2. Announce the new page title via a visually-hidden aria-live="polite" region.
 *
 * Mounted once inside HashRouter so useLocation() works correctly.
 * A guard ref prevents running on the initial render (no focus-steal on load).
 */
const RouteAnnouncer: React.FC = () => {
  const location = useLocation();
  const announcerRef = useRef<HTMLSpanElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const title = getRouteTitle(location.pathname);

    // Update the live region text — screen readers announce when it changes.
    // Clear first so repeated navigation to the same route still fires an event.
    if (announcerRef.current) {
      announcerRef.current.textContent = '';
    }

    // Defer both the re-announcement and focus shift by one frame so the new
    // page's DOM (including #main-content) is mounted before we target it.
    const raf = requestAnimationFrame(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = `Navigated to ${title}`;
      }
      // Move focus to the main content region — avoids focus-steal on initial load
      // because isFirstRender guard already returned early above.
      const main = document.getElementById('main-content');
      if (main) {
        main.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  return (
    <span
      ref={announcerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      /* Visually hidden but accessible to screen readers */
      className="sr-only"
    />
  );
};

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell>{children}</AppShell>;
};

const App: React.FC = () => {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        {/* NEW-A11Y-1: route announcer lives inside HashRouter so useLocation works */}
        <RouteAnnouncer />
        <div className="h-screen bg-neutral-background-2 text-neutral-foreground-1 font-sans">
          <SearchDialog />
          <Routes>
          {/* Public route */}
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginScreen />
            }
          />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspaces"
            element={
              <ProtectedRoute>
                <WorkspacesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps"
            element={
              <ProtectedRoute>
                <AppsPage />
              </ProtectedRoute>
            }
          />
          {/* App viewer - loads full Power BI App experience */}
          <Route
            path="/app/:appId"
            element={
              <ProtectedRoute>
                <AppViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report/:workspaceId/:reportId"
            element={
              <ProtectedRoute>
                <ReportViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:workspaceId/:dashboardId"
            element={
              <ProtectedRoute>
                <DashboardViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/presentation/:workspaceId/:reportId"
            element={
              <ProtectedRoute>
                <PresentationMode />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
