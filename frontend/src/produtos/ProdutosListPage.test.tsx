import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProdutosListPage } from './ProdutosListPage';
import { ProdutoDetailPage } from './ProdutoDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const PCS = {
  id: 'p1',
  codigo: 'PCS',
  nome: 'Programa Consultório Smart',
  assinatura: false,
  nomeCurado: 'Programa Consultório Smart',
  nomeDerivado: null,
  assinaturaCurada: false,
  assinaturaDerivada: null,
  camposEditados: ['nome', 'assinatura'],
  criadoEm: '2026-09-11T00:00:00Z',
  atualizadoEm: '2026-09-11T00:00:00Z',
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), {
        status: s,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/produtos?')) {
      return ok({ itens: [PCS], pagina: 1, tamanho: 25, total: 1 });
    }
    if (/^\/produtos\/PCS$/.test(url)) return ok(PCS);
    if (url.startsWith('/ofertas?')) return ok({ itens: [], pagina: 1, tamanho: 25, total: 0 });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/produtos', element: <ProdutosListPage /> },
      { path: '/produtos/:codigo', element: <ProdutoDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Produtos (spec 023)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista renderiza os produtos', async () => {
    vi.stubGlobal('fetch', servidor(['produto:ver']));
    renderRota('/produtos');
    expect(await screen.findByRole('link', { name: 'PCS' })).toBeInTheDocument();
    expect(screen.getByText(/Programa Consultório Smart/)).toBeInTheDocument();
  });

  it('detalhe mostra o produto e o formulário de curadoria só com produto:editar', async () => {
    vi.stubGlobal('fetch', servidor(['produto:ver']));
    renderRota('/produtos/PCS');
    expect(await screen.findByText(/sem nome curado|Programa Consultório Smart/)).toBeInTheDocument();
    expect(screen.queryByText('Curadoria')).not.toBeInTheDocument();
  });

  it('sujeito com produto:editar vê o formulário de curadoria', async () => {
    vi.stubGlobal('fetch', servidor(['produto:ver', 'produto:editar']));
    renderRota('/produtos/PCS');
    expect(await screen.findByText('Curadoria')).toBeInTheDocument();
  });
});
