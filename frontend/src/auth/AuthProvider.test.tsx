import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { fakeJwt } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';
import { useAuth } from './auth-context';
import { apiFetch } from './api-client';

function Sonda() {
  const { status, logoutReason } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="reason">{logoutReason ?? '-'}</span>
    </div>
  );
}

function resposta(status: number): Response {
  return {
    ok: false,
    status,
    clone() {
      return this as unknown as Response;
    },
    json: async () => ({}),
  } as unknown as Response;
}

describe('AuthProvider', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('token com exp no passado no storage → monta deslogado, sem chamar a API', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('pandora.token', fakeJwt(-60));

    render(
      <ComAuth>
        <Sonda />
      </ComAuth>,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('deslogado');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('um 401 numa chamada protegida → status deslogado + logoutReason "expirada"', async () => {
    window.localStorage.setItem('pandora.token', fakeJwt(3600));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401)));

    render(
      <ComAuth>
        <Sonda />
      </ComAuth>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('logado');

    await act(async () => {
      await apiFetch('/protegida').catch(() => {});
    });

    expect(screen.getByTestId('status')).toHaveTextContent('deslogado');
    expect(screen.getByTestId('reason')).toHaveTextContent('expirada');
  });
});
