import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Moon, Shield, Sparkles, Sun } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Badge, Button, ButtonLink } from './ui/index.ts';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'shorturl_theme';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage access restrictions
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function Layout() {
  const { user, logout, hasFeature } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isAdmin = Boolean(
    user && (user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles'))
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access restrictions
    }
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#0c0a09' : '#f5f5f4');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const themeLabel = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';

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

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </Button>
          </nav>
        </div>
      </header>

      <main className="main-container">
        <Outlet />
      </main>
    </div>
  );
}
