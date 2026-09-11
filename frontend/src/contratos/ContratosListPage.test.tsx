import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContratosListPage } from './ContratosListPage';
import { ContratoDetailPage } from './ContratoDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const CONTRATO_ATIVO = {
  id: 'c1',
  pessoa: { id: 'p1', nome: 'Fulana de Tal' },
  produto: { id: 'prod1', codigo: 'PCS' },
  statusCanonico: 'ATIVO',
  acessoLiberado: true,
  fimAcesso: '2026-10-01T00:00:00.000Z',
  ticketTotal: { BRL: '19700000' },
  valorRecebido: { BRL: '19700000' },
  ajusteManualStatus: null,
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
    if (url.startsWith('/contratos?')) {
      const soExpirado = url.includes('status=EXPIRADO');
      return ok({
        itens: soExpirado
          ? [{ ...CONTRATO_ATIVO, id: 'c2', statusCanonico: 'EXPIRADO', pessoa: { id: 'p2', nome: 'Beltrana' } }]
          : [CONTRATO_ATIVO, { ...CONTRATO_ATIVO, id: 'c2', statusCanonico: 'EXPIRADO', pessoa: { id: 'p2', nome: 'Beltrana' } }],
        pagina: 1,
        tamanho: 25,
        total: soExpirado ? 1 : 2,
      });
    }
    if (/^\/contratos\/c1$/.test(url))
      return ok({
        ...CONTRATO_ATIVO,
        toleranciaAtrasoDias: 0,
        contratoAssinado: false,
        ajusteManualEm: null,
        ajusteManualAutor: null,
        ajusteManualMotivo: null,
        criadoEm: '2026-08-01T00:00:00.000Z',
        atualizadoEm: '2026-08-01T00:00:00.000Z',
        aditivos: [
          {
            id: 'ad1',
            transacaoId: 't1',
            rotulo: 'COMPRA_INICIAL',
            ocorridoEm: '2026-08-01T00:00:00.000Z',
            fimAcessoResultante: '2026-10-01T00:00:00.000Z',
            valorBruto: { valorInt: '19700000', moeda: 'BRL' },
            statusCanonicoTransacao: 'PAGO',
            precisaRevisao: false,
            motivoRevisao: null,
          },
        ],
      });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/contratos', element: <ContratosListPage /> },
      { path: '/contratos/:id', element: <ContratoDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Contratos (spec 025)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista renderiza os contratos com status e valor recebido', async () => {
    vi.stubGlobal('fetch', servidor(['contrato:ver']));
    renderRota('/contratos');
    expect(
      await screen.findByRole('link', { name: /Fulana de Tal · PCS/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/BRL 1\.970,00/).length).toBeGreaterThan(0);
  });

  it('filtro de status muda a query e a lista', async () => {
    vi.stubGlobal('fetch', servidor(['contrato:ver']));
    renderRota('/contratos');
    await screen.findByRole('link', { name: /Fulana de Tal/ });
    expect(screen.getByRole('link', { name: /Beltrana/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'EXPIRADO' } });
    await screen.findByRole('link', { name: /Beltrana/ });
    expect(screen.queryByRole('link', { name: /Fulana de Tal/ })).not.toBeInTheDocument();
  });

  it('detalhe mostra a linha do tempo de aditivos', async () => {
    vi.stubGlobal('fetch', servidor(['contrato:ver']));
    renderRota('/contratos/c1');
    expect(await screen.findByText('Compra inicial')).toBeInTheDocument();
    expect(screen.getByText(/PCS/)).toBeInTheDocument();
  });

  it('sem contrato:editar não mostra o formulário de ajuste manual', async () => {
    vi.stubGlobal('fetch', servidor(['contrato:ver']));
    renderRota('/contratos/c1');
    await screen.findByText('Compra inicial');
    expect(screen.queryByText('Ajuste manual')).not.toBeInTheDocument();
  });

  it('com contrato:editar mostra o formulário de ajuste manual', async () => {
    vi.stubGlobal('fetch', servidor(['contrato:ver', 'contrato:editar']));
    renderRota('/contratos/c1');
    await screen.findByText('Compra inicial');
    expect(await screen.findByText('Ajuste manual')).toBeInTheDocument();
  });
});
