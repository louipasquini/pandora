import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach } from 'vitest';
import { routes } from './router';
import { AuthProvider } from '../auth/AuthProvider';
import { semearToken } from '../test/auth-helpers';

/** US1 / spec 003: com sessão válida, "/" renderiza a visão geral no shell. */
describe('App', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('renderiza a visão geral em "/" quando logado', async () => {
    semearToken();
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    const qc = new QueryClient();

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
    expect(screen.getByText(/esqueleto do painel pandora/i)).toBeInTheDocument();
  });

  it('redireciona para /login sem sessão', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    const qc = new QueryClient();

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /entrar/i })).toBeInTheDocument();
  });
});
