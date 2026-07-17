import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User, AuthPayload } from '../types/models.js';
import type { UserRole } from '../types/advanced.js';
import { hasPermission } from '../types/advanced.js';
import { apiRequest } from '../services/api.client.js';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'enterprise_auth';

interface StoredAuth {
  token: string;
  refreshToken?: string;
  user: User;
}

function loadStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored();
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [refreshToken, setRefreshToken] = useState<string | null>(stored?.refreshToken ?? null);
  const [user, setUser] = useState<User | null>(stored?.user ?? null);

  const persist = useCallback((data: AuthPayload) => {
    const access = data.accessToken ?? data.token;
    const refresh = data.refreshToken ?? refreshToken;
    setToken(access);
    if (refresh) setRefreshToken(refresh);
    setUser(data.user);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: access, refreshToken: refresh, user: data.user })
    );
  }, [refreshToken]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<AuthPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    persist(data);
  }, [persist]);

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const data = await apiRequest<AuthPayload>('/auth/register', {
        method: 'POST',
        body: { email, password, fullName },
      });
      persist(data);
    },
    [persist]
  );

  const logout = useCallback(() => {
    if (refreshToken) {
      void apiRequest('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      }).catch(() => undefined);
    }
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [refreshToken]);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      return hasPermission(user.role as UserRole, permission);
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, token, login, register, logout, can }),
    [user, token, login, register, logout, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
