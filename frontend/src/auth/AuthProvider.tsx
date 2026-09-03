import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { queryClient } from '../app/query-client';
import { ApiError } from './ApiError';
import { AuthContext, type AuthApi, type LogoutReason } from './auth-context';
import {
  apiFetch,
  resetAuthGate,
  setTokenGetter,
  setUnauthorizedHandler,
} from './api-client';
import { expirado } from './decode-jwt';
import { clearToken, readToken, storageDisponivel, writeToken } from './token-storage';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const t = readToken();
    return t && !expirado(t) ? t : null;
  });
  const [logoutReason, setLogoutReason] = useState<LogoutReason>(null);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    setTokenGetter(() => tokenRef.current);
    setUnauthorizedHandler(() => {
      clearToken();
      queryClient.clear();
      setToken(null);
      setLogoutReason('expirada');
    });
  }, []);

  const login = useCallback(async (clientId: string, clientSecret: string) => {
    const res = await apiFetch('/auth/token', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    const data = (await res.json()) as { access_token?: unknown };
    if (typeof data.access_token !== 'string') {
      throw new ApiError(500, 'resposta sem access_token');
    }
    writeToken(data.access_token);
    resetAuthGate();
    setLogoutReason(null);
    setToken(data.access_token);
  }, []);

  const logout = useCallback((reason?: 'expirada') => {
    clearToken();
    queryClient.clear();
    setToken(null);
    setLogoutReason(reason ?? null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      token,
      status: token ? 'logado' : 'deslogado',
      persistente: storageDisponivel(),
      logoutReason,
      login,
      logout,
    }),
    [token, logoutReason, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
