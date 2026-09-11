import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfertasListPage } from './OfertasListPage';
import { OfertaDetailPage } from './OfertaDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const OFERTA_48 = {
  id: 'o1',
  produtoId: 'p1',
  turma: { tipo: 'NUMERO', numero: 48 },
  subprodutoCodigo: 'X',
  modeloCobrancaCodigo: 'A',
  modeloTransacaoCodigo: 'V',
  turmaTipoCurado: null,
  turmaNumeroCurado: null,
  turmaTipoDerivado: 'NUMERO',
  turmaNumeroDerivado: 48,
  camposEditados: [],
  produto: { id: 'p1', codigo: 'PCS' },
  origensRef: [{ plataformaOrigem: 'GURU_PRD', tipoRef: 'TAG', valorRef: 'PCS48XAV' }],
  catalogo: null,
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
    if (url.startsWith('/ofertas?')) {
      return ok({ itens: [OFERTA_48], pagina: 1, tamanho: 25, total: 1 });
    }
    if (/^\/ofertas\/o1$/.test(url)) return ok(OFERTA_48);
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/ofertas', element: <OfertasListPage /> },
      { path: '/ofertas/:id', element: <OfertaDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Ofertas (spec 023)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista renderiza a oferta com a turma efetiva', async () => {
    vi.stubGlobal('fetch', servidor(['oferta:ver']));
    renderRota('/ofertas');
    expect(await screen.findByRole('link', { name: /PCS · Turma 48/ })).toBeInTheDocument();
    expect(screen.getByText(/sem catálogo/)).toBeInTheDocument();
  });

  it('detalhe mostra os aliases de origem; formulário de curadoria só com oferta:editar', async () => {
    vi.stubGlobal('fetch', servidor(['oferta:ver']));
    renderRota('/ofertas/o1');
    expect(await screen.findByText(/GURU_PRD \(TAG: PCS48XAV\)/)).toBeInTheDocument();
    expect(screen.queryByText('Curadoria')).not.toBeInTheDocument();
  });

  it('sujeito com oferta:editar vê o formulário de curadoria', async () => {
    vi.stubGlobal('fetch', servidor(['oferta:ver', 'oferta:editar']));
    renderRota('/ofertas/o1');
    expect(await screen.findByText('Curadoria')).toBeInTheDocument();
  });
});
