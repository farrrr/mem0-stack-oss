import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  hasMaintenanceKey: boolean;
}

interface AuthContextType extends AuthState {
  login: (apiKey: string) => void;
  setMaintenanceKey: (key: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    isAuthenticated: !!localStorage.getItem('admin_api_key'),
    hasMaintenanceKey: !!localStorage.getItem('maintenance_api_key'),
  }));

  const login = useCallback((apiKey: string) => {
    localStorage.setItem('admin_api_key', apiKey);
    setState((s) => ({ ...s, isAuthenticated: true }));
  }, []);

  const setMaintenanceKey = useCallback((key: string) => {
    localStorage.setItem('maintenance_api_key', key);
    setState((s) => ({ ...s, hasMaintenanceKey: true }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_api_key');
    localStorage.removeItem('maintenance_api_key');
    setState({ isAuthenticated: false, hasMaintenanceKey: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, setMaintenanceKey, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
