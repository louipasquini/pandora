/**
 * Persistência do token do painel. `localStorage` (decisão CL-02: sobrevive a
 * fechar/reabrir o navegador e é compartilhado entre abas). Se `localStorage`
 * estiver indisponível (aba privada restrita, storage bloqueado), degrada para
 * uma variável de módulo em memória e liga `storageDisponivel() === false` — o
 * painel avisa que o login não vai persistir. Nunca propaga exceção de storage.
 */
const STORAGE_KEY = 'pandora.token';

let memoria: string | null = null;
let disponivel = true;

export function storageDisponivel(): boolean {
  return disponivel;
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    disponivel = false;
    return memoria;
  }
}

export function writeToken(token: string): void {
  memoria = token;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    disponivel = false;
  }
}

export function clearToken(): void {
  memoria = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    disponivel = false;
  }
}
