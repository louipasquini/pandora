import { afterEach, beforeEach, vi } from 'vitest';
import { ApiError } from './ApiError';
import {
  apiFetch,
  resetAuthGate,
  setTokenGetter,
  setUnauthorizedHandler,
} from './api-client';

function resposta(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone() {
      return this as unknown as Response;
    },
    json: async () => body,
  } as unknown as Response;
}

describe('api-client', () => {
  beforeEach(() => {
    resetAuthGate();
    setTokenGetter(() => null);
    setUnauthorizedHandler(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('injeta Authorization: Bearer quando há token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(200));
    vi.stubGlobal('fetch', fetchMock);
    setTokenGetter(() => 'meu-token');

    await apiFetch('/x');

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer meu-token');
  });

  it('resposta !ok → lança ApiError com status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(500)));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 500 });
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('N respostas 401 concorrentes → onUnauthorized UMA vez (SC-007)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401)));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () => apiFetch('/protegida')),
    );

    expect(resultados.every((r) => r.status === 'rejected')).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('401 de POST /auth/token NÃO dispara onUnauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401)));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(apiFetch('/auth/token', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
