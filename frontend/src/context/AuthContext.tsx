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
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'enterprise_auth';

function loadStored(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { token: string; user: User }) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored();
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [user, setUser] = useState<User | null>(stored?.user ?? null);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<AuthPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      return hasPermission(user.role as UserRole, permission);
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, token, login, logout, can }),
    [user, token, login, logout, can]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
