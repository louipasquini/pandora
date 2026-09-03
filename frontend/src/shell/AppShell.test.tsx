import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, vi } from 'vitest';
import { AppShell } from './AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

/** US4: o shell tem cabeçalho, navegação e área de conteúdo. */
describe('AppShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  function renderShell() {
    semearToken();
    const router = createMemoryRouter(
      [{ path: '/', element: <AppShell />, children: [{ index: true, element: <p>conteúdo</p> }] }],
      { initialEntries: ['/'] },
    );
    return render(
      <ComAuth>
        <RouterProvider router={router} />
      </ComAuth>,
    );
  }

  it('mostra o cabeçalho da marca', () => {
    renderShell();
    expect(screen.getByRole('banner')).toHaveTextContent(/projeto pandora/i);
  });

  it('mostra a navegação principal com os módulos', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: /navegação principal/i });
    expect(nav).toHaveTextContent('CRM');
    expect(nav).toHaveTextContent('Financeiro');
    expect(nav).toHaveTextContent('Marketing');
    expect(nav).toHaveTextContent('Central de Clientes');
  });

  it('renderiza a área de conteúdo roteável', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveTextContent('conteúdo');
  });

  it('mostra "Administração" com a permissão perfil:administrar (spec 004)', async () => {
    // o mock global de fetch em test/setup.ts devolve o catálogo inteiro
    renderShell();
    const nav = screen.getByRole('navigation', { name: /navegação principal/i });
    expect(await screen.findByRole('link', { name: 'Administração' })).toBeInTheDocument();
    expect(nav).toHaveTextContent('Administração');
  });

  it('esconde "Administração" sem a permissão (spec 004)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/permissoes-efetivas')) {
          return new Response(JSON.stringify({ permissoes: ['lead:criar'] }), { status: 200 });
        }
        return new Response('{}', { status: 599 });
      }),
    );
    renderShell();
    // dá tempo da query resolver
    expect(await screen.findByText('CRM')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument();
  });
});
