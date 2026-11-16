import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Badge, Button, ButtonLink } from './ui/index.ts';

export function Layout() {
  const { user, logout, hasFeature } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(
    user && (user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles'))
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              s/
            </span>
            <span>Short API</span>
          </Link>

          <nav className="nav-links" aria-label="Navegação principal">
            <NavLink to="/" end className="nav-link">
              <Sparkles size={16} aria-hidden="true" />
              <span>Encurtador</span>
            </NavLink>

            {user ? (
              <>
                {hasFeature('links.manage_own') && (
                  <NavLink to="/app" className="nav-link">
                    <LayoutDashboard size={16} aria-hidden="true" />
                    <span>Painel</span>
                  </NavLink>
                )}
                {isAdmin && (
                  <NavLink to="/admin" className="nav-link">
                    <Shield size={16} aria-hidden="true" />
                    <span>Admin</span>
                  </NavLink>
                )}
                <Badge tone="accent">
                  {user.name} · {user.plan.name}
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut size={15} aria-hidden="true" />
                  <span>Sair</span>
                </Button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="nav-link">
                  Entrar
                </NavLink>
                <ButtonLink to="/register" variant="primary" size="sm">
                  Criar conta
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="main-container">
        <Outlet />
      </main>
    </div>
  );
}
