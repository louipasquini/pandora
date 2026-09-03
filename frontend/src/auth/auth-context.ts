import { createContext, useContext } from 'react';

export type LogoutReason = 'expirada' | null;

export interface AuthApi {
  token: string | null;
  status: 'logado' | 'deslogado';
  /** `false` se o token só vive em memória (localStorage indisponível). */
  persistente: boolean;
  logoutReason: LogoutReason;
  login(clientId: string, clientSecret: string): Promise<void>;
  logout(reason?: 'expirada'): void;
}

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa de <AuthProvider>');
  return ctx;
}
