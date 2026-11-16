import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FeatureMap, UserProfile } from '../../shared/contracts.ts';
import { apiRequest } from '../lib/api.ts';

interface AuthContextValue {
  user: UserProfile | null;
  features: FeatureMap;
  loading: boolean;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  getFeatureLimit: (key: string) => number | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [features, setFeatures] = useState<FeatureMap>({});
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: UserProfile | null; features: FeatureMap }>('/api/auth/me');
      setUser(data.user);
      setFeatures(data.features ?? {});
    } catch {
      setUser(null);
      setFeatures({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{ user: UserProfile; features: FeatureMap }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    setFeatures(data.features ?? {});
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await apiRequest<{ user: UserProfile; features: FeatureMap }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setUser(data.user);
    setFeatures(data.features ?? {});
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setFeatures({});
  }, []);

  const hasFeature = useCallback((key: string) => Boolean(features[key]?.enabled), [features]);
  const getFeatureLimit = useCallback((key: string) => features[key]?.limit ?? null, [features]);

  return (
    <AuthContext.Provider
      value={{
        user,
        features,
        loading,
        refreshSession,
        login,
        register,
        logout,
        hasFeature,
        getFeatureLimit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
