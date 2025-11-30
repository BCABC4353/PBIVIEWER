import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
