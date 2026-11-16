import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import { Layout } from '../shared/Layout.tsx';
import { PublicHomePage } from '../features/shortener/PublicHomePage.tsx';
import { AuthPage } from '../features/auth/AuthPage.tsx';
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx';
import { LinkDetailPage } from '../features/dashboard/LinkDetailPage.tsx';
import { AdminPage } from '../features/admin/AdminPage.tsx';

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading, hasFeature } = useAuth();
  if (loading) return <div className="neo-card-sm">Carregando sessão...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const isAdmin = user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles');
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
