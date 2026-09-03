import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { LoginPage } from './LoginPage';
import { fakeJwt } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function resposta(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone() {
      return this as unknown as Response;
    },
    json: async () => body,
  } as unknown as Response;
}

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <p>painel carregado</p> },
    ],
    { initialEntries: ['/login'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

function preencherEEnviar() {
  fireEvent.change(screen.getByLabelText(/client id/i), { target: { value: 'pandora-panel' } });
  fireEvent.change(screen.getByLabelText(/client secret/i), { target: { value: 'segredo-super' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('LoginPage', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('credenciais corretas → entra e vai para o painel; token guardado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resposta(200, { access_token: fakeJwt(), token_type: 'Bearer', expires_in: 43200 })),
    );

    renderLogin();
    preencherEEnviar();

    expect(await screen.findByText(/painel carregado/i)).toBeInTheDocument();
    expect(window.localStorage.getItem('pandora.token')).toBeTruthy();
  });

  it('401 → "Credenciais inválidas", continua no login, sem token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401, { message: 'credenciais inválidas' })));

    renderLogin();
    preencherEEnviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(/credenciais inválidas/i);
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('pandora.token')).toBeNull();
  });

  it('429 → mensagem de "muitas tentativas"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(429, { message: 'muitas tentativas' })));

    renderLogin();
    preencherEEnviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(/muitas tentativas/i);
  });
});
