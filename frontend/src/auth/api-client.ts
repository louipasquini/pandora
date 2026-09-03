import { ApiError } from './ApiError';

/**
 * Ponto **único** de saída HTTP do painel. Injeta `Authorization: Bearer` e
 * concentra o tratamento de 401 (D9 / FR-027..FR-030): um 401 em qualquer
 * chamada que não seja `POST /auth/token` aciona `onUnauthorized` **uma vez**
 * por sessão de página; o `AuthProvider` liga isso a limpar o token e reconduzir
 * ao Login. Um 401 de `/auth/token` é só erro de credencial (fica na tela de
 * Login).
 */
const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001';

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

let getToken: TokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};
let jaExpirou = false;

export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}
export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn;
}
/** Chamado após um login bem-sucedido — rearma o gate de expiração. */
export function resetAuthGate(): void {
  jaExpirou = false;
}

async function corpoSeguro(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return undefined;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && path !== '/auth/token') {
    if (!jaExpirou) {
      jaExpirou = true;
      onUnauthorized();
    }
    throw new ApiError(401, await corpoSeguro(res));
  }
  if (!res.ok) {
    throw new ApiError(res.status, await corpoSeguro(res));
  }
  return res;
}
