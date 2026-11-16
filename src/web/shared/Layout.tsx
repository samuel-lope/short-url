import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';

export function Layout() {
  const { user, logout, hasFeature } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(user && (user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles')));

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span>SHORT API</span>
          <span className="brand-badge">v2</span>
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
              <span className="tag tag-purple" title={`Plano ${user.plan.name}`}>
                {user.name} · {user.plan.name}
              </span>
              <button type="button" className="neo-btn neo-btn-sm" onClick={handleLogout}>
                <LogOut size={15} aria-hidden="true" />
                <span>Sair</span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">
                Entrar
              </NavLink>
              <NavLink to="/register" className="nav-link" style={{ background: 'var(--accent-mint)' }}>
                Criar conta
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <main className="main-container">
        <Outlet />
      </main>
    </div>
  );
}
