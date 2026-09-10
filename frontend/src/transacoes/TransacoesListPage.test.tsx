import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransacoesListPage } from './TransacoesListPage';
import { TransacaoDetailPage } from './TransacaoDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const T_PAGO = {
  id: 't1',
  plataformaOrigem: 'GURU_PRD',
  idOrigem: 'txn_1',
  tipoOrigem: 'guru.webhook',
  statusOrigem: 'PAGO',
  statusCanonico: 'PAGO',
  classificacao: 'VENDA_PROPRIA',
  ocorridoEm: '2026-08-30T14:02:00Z',
  pessoaId: 'p1',
  ehAfiliada: false,
  precisaRevisao: false,
  valorBruto: { valorInt: '19700000', moeda: 'BRL' },
  valorLiquido: null,
  eventoOrigemId: 'ev1',
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
    if (url.startsWith('/financeiro/transacoes?')) {
      const soPago = url.includes('statusCanonico=PAGO');
      return ok({
        itens: soPago ? [T_PAGO] : [T_PAGO, { ...T_PAGO, id: 't2', idOrigem: 'txn_2', statusCanonico: 'PENDENTE' }],
        pagina: 1,
        tamanho: 25,
        total: soPago ? 1 : 2,
      });
    }
    if (/^\/financeiro\/transacoes\/t1$/.test(url))
      return ok({
        ...T_PAGO,
        pessoa: { id: 'p1', nome: 'Fulana' },
        ofertaId: null,
        contratoId: null,
        transacaoVinculadaId: null,
        taxas: { valorInt: '1200000', moeda: 'BRL' },
        reembolso: null,
        quantidade: 1,
        ehRecorrencia: false,
        assinaturaCiclo: null,
        numeroCiclo: null,
        ofertaCodigoOrigem: 'PCS48XAV',
        ofertaNomeOrigem: null,
        motivoRevisao: null,
        criadoEm: '2026-08-30T14:03:00Z',
        atualizadoEm: '2026-08-30T14:03:00Z',
      });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/financeiro/transacoes', element: <TransacoesListPage /> },
      { path: '/financeiro/transacoes/:id', element: <TransacaoDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Transações (spec 018)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista renderiza as transações e formata o valor', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver']));
    renderRota('/financeiro/transacoes');
    expect(
      await screen.findByRole('link', { name: /GURU_PRD · txn_1/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/BRL 1\.970,00/).length).toBeGreaterThan(0);
  });

  it('filtro de status muda a query e a lista', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver']));
    renderRota('/financeiro/transacoes');
    await screen.findByRole('link', { name: /txn_1/ });
    expect(screen.getByRole('link', { name: /txn_2/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status canônico'), { target: { value: 'PAGO' } });
    await screen.findByRole('link', { name: /txn_1/ });
    expect(screen.queryByRole('link', { name: /txn_2/ })).not.toBeInTheDocument();
  });

  it('detalhe mostra valores por moeda e link para o evento de origem', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver']));
    renderRota('/financeiro/transacoes/t1');
    expect(await screen.findByText('Fulana')).toBeInTheDocument();
    expect(screen.getByText(/BRL 1.970,00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver evento/ })).toHaveAttribute(
      'href',
      '/eventos/ev1',
    );
  });
});
