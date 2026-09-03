import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, vi } from 'vitest';
import { ContasListPage } from './ContasListPage';
import { ContaDetailPage } from './ContaDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/contas?') && method === 'GET')
      return ok({
        itens: [{ id: 'c1', nome: 'Família Souza', tipo: 'HOUSEHOLD', totalPessoas: 2, unificada: false }],
        pagina: 1,
        tamanho: 25,
        total: 1,
      });
    if (/^\/contas\/c1$/.test(url))
      return ok({
        id: 'c1',
        nome: 'Família Souza',
        tipo: 'HOUSEHOLD',
        pessoas: [{ id: 'p1', nome: 'Maria' }],
        merges: [],
      });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/contas', element: <ContasListPage /> },
      { path: '/contas/:id', element: <ContaDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Contas (spec 005)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista carrega; "Nova conta" só com conta:editar', async () => {
    vi.stubGlobal('fetch', servidor(['conta:ver']));
    renderRota('/contas');
    expect(await screen.findByRole('link', { name: 'Família Souza' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova conta' })).not.toBeInTheDocument();
  });

  it('detalhe mostra membros; "Associar" só com conta:editar', async () => {
    vi.stubGlobal('fetch', servidor(['conta:ver', 'conta:editar']));
    renderRota('/contas/c1');
    expect(await screen.findByRole('link', { name: 'Maria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Associar' })).toBeInTheDocument();
  });

  it('sem conta:editar o detalhe é somente leitura', async () => {
    vi.stubGlobal('fetch', servidor(['conta:ver']));
    renderRota('/contas/c1');
    await screen.findByRole('link', { name: 'Maria' });
    expect(screen.queryByRole('button', { name: 'Associar' })).not.toBeInTheDocument();
  });
});
