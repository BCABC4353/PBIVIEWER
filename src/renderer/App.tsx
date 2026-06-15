import React, { useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from './stores/auth-store';
import { initEvictOnLogout } from './lib/evict-on-logout';
import { LoginScreen } from './components/auth/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './components/home/HomePage';
import { ReportViewer } from './components/viewer/ReportViewer';
import { DashboardViewer } from './components/viewer/DashboardViewer';
import { PresentationMode } from './components/viewer/PresentationMode';
import { AppViewer } from './components/viewer/AppViewer';
import { WorkspacesPage } from './components/workspaces/WorkspacesPage';
import { AppsPage } from './components/apps/AppsPage';
import { InsightsPage } from './components/insights/InsightsPage';
import { SearchDialog } from './components/search/SearchDialog';
import { SettingsPage } from './components/settings/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';

const LoadingScreen: React.FC = () => (
  <div className="h-screen flex items-center justify-center bg-neutral-background-2">
    <div className="text-center">
      <Spinner size="large" />
      <p className="mt-4 text-neutral-foreground-2">Loading...</p>
    </div>
  </div>
);

function getRouteTitle(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname === '/workspaces') return 'Workspaces';
  if (pathname === '/apps') return 'Apps';
  if (pathname === '/insights') return 'Insights';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/login') return 'Sign in';
  if (pathname.startsWith('/report/')) return 'Report';
  if (pathname.startsWith('/dashboard/')) return 'Dashboard';
  if (pathname.startsWith('/presentation/')) return 'Presentation';
  if (pathname.startsWith('/app/')) return 'App';
  return 'Power BI Viewer';
}

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

    if (announcerRef.current) {
      announcerRef.current.textContent = '';
    }

    const raf = requestAnimationFrame(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = `Navigated to ${title}`;
      }
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
      className="sr-only"
    />
  );
};

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

const AutoStartRouter: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const navigate = useNavigate();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    void (async () => {
      try {
        const settingsResp = await window.electronAPI.settings.get();
        if (!settingsResp.success) {
          onDone();
          return;
        }
        const {
          autoStartMode,
          autoStartReportId,
          autoStartWorkspaceId,
          autoStartAppId,
          autoStartSlideshow,
        } = settingsResp.data;

        if (autoStartMode === 'report' && autoStartReportId && autoStartWorkspaceId) {
          const reportsResp = await window.electronAPI.content.getReports(autoStartWorkspaceId);
          if (
            reportsResp.success &&
            reportsResp.data.some((r) => r.id === autoStartReportId)
          ) {
            const target = autoStartSlideshow
              ? `/presentation/${autoStartWorkspaceId}/${autoStartReportId}`
              : `/report/${autoStartWorkspaceId}/${autoStartReportId}`;
            navigate(target, { replace: true });
          }
          onDone();
          return;
        }

        if (autoStartMode === 'app' && autoStartAppId) {
          const appResp = await window.electronAPI.content.getApp(autoStartAppId);
          if (appResp.success && appResp.data) {
            navigate(`/app/${autoStartAppId}`, { replace: true });
          }
          onDone();
          return;
        }

        onDone();
      } catch {
        onDone();
      }
    })();
  }, [navigate, onDone]);

  return <LoadingScreen />;
};

const App: React.FC = () => {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore();
  const [autoStartDone, setAutoStartDone] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const unsubscribe = initEvictOnLogout();
    return unsubscribe;
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const needsAutoStartCheck = isAuthenticated && !autoStartDone;

  return (
    <ErrorBoundary>
      <HashRouter>
        {}
        <RouteAnnouncer />
        {}
        {needsAutoStartCheck && (
          <AutoStartRouter onDone={() => setAutoStartDone(true)} />
        )}
        <div
          className="h-screen bg-neutral-background-2 text-neutral-foreground-1 font-sans"
          style={needsAutoStartCheck ? { display: 'none' } : undefined}
        >
          <SearchDialog />
          <Routes>
          {}
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginScreen />
            }
          />

          {}
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
          {}
          <Route
            path="/app/:appId"
            element={
              <ProtectedRoute>
                <AppViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insights"
            element={
              <ProtectedRoute>
                <InsightsPage />
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

          {}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
