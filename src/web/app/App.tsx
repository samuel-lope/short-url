import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import { Layout } from '../shared/Layout.tsx';
import { ErrorBoundary } from '../shared/ErrorBoundary.tsx';
import { Skeleton, Tile } from '../shared/ui/index.ts';
import { PublicHomePage } from '../features/shortener/PublicHomePage.tsx';

const AuthPage = lazy(() =>
  import('../features/auth/AuthPage.tsx').then((m) => ({ default: m.AuthPage }))
);
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage }))
);
const LinkDetailPage = lazy(() =>
  import('../features/dashboard/LinkDetailPage.tsx').then((m) => ({ default: m.LinkDetailPage }))
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage.tsx').then((m) => ({ default: m.AdminPage }))
);

function RouteFallback() {
  return (
    <Tile c={4}>
      <Skeleton rows={4} />
    </Tile>
  );
}

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading, hasFeature } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace />;
  const isAdmin = user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles');
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<PublicHomePage />} />
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/register" element={<AuthPage mode="register" />} />
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/links/:id"
                  element={
                    <ProtectedRoute>
                      <LinkDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
