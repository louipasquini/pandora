import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransacoesListPage } from './TransacoesListPage';
import { TransacaoDetailPage } from './TransacaoDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const ASAAS_PENDENTE = {
  id: 'a1',
  plataformaOrigem: 'ASAAS_PRD',
  idOrigem: 'pay_1',
  tipoOrigem: 'asaas.webhook',
  statusOrigem: 'CONFIRMED',
  statusCanonico: 'PAGO',
  classificacao: 'VENDA_PROPRIA',
  ocorridoEm: '2026-09-11T10:00:00Z',
  pessoaId: null,
  ehAfiliada: false,
  precisaRevisao: false,
  valorBruto: { valorInt: '19700000', moeda: 'BRL' },
  valorLiquido: null,
  eventoOrigemId: null,
  transacaoVinculadaId: null,
  vinculoPendente: true,
};

const ASAAS_VINCULADA_DETALHE = {
  ...ASAAS_PENDENTE,
  pessoa: null,
  ofertaId: null,
  contratoId: null,
  transacaoVinculadaId: 'g1',
  vinculoPendente: false,
  vinculo: { transacaoVinculadaId: 'g1', origemRef: 'guru_1', resolvidoEm: '2026-09-11T10:05:00Z' },
  taxas: null,
  reembolso: null,
  quantidade: 1,
  ehRecorrencia: false,
  assinaturaCiclo: null,
  numeroCiclo: null,
  ofertaCodigoOrigem: null,
  ofertaNomeOrigem: null,
  motivoRevisao: null,
  criadoEm: '2026-09-11T10:00:00Z',
  atualizadoEm: '2026-09-11T10:05:00Z',
};

function detalhePendente() {
  return {
    ...ASAAS_PENDENTE,
    pessoa: null,
    ofertaId: null,
    contratoId: null,
    vinculo: null,
    taxas: null,
    reembolso: null,
    quantidade: 1,
    ehRecorrencia: false,
    assinaturaCiclo: null,
    numeroCiclo: null,
    ofertaCodigoOrigem: null,
    ofertaNomeOrigem: null,
    motivoRevisao: null,
    criadoEm: '2026-09-11T10:00:00Z',
    atualizadoEm: '2026-09-11T10:00:00Z',
  };
}

function servidor(
  perms: string[],
  opts: { resolveOnRetry?: boolean } = {},
) {
  let vinculado = false;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
      return ok({ itens: [ASAAS_PENDENTE], pagina: 1, tamanho: 25, total: 1 });
    }
    if (url === '/financeiro/transacoes/tentar-vincular-pendentes' && init?.method === 'POST') {
      return ok({ tentativas: 1, resolvidos: 1 });
    }
    if (url === '/financeiro/transacoes/a1/tentar-vincular' && init?.method === 'POST') {
      if (opts.resolveOnRetry) vinculado = true;
      return ok({ vinculado: !!opts.resolveOnRetry, papel: 'ASAAS' });
    }
    if (url === '/financeiro/transacoes/a1') {
      return ok(vinculado ? ASAAS_VINCULADA_DETALHE : detalhePendente());
    }
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

describe('Vínculo Asaas↔Guru (spec 024)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista mostra o badge "vínculo pendente" para a transação Asaas pendente', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver']));
    renderRota('/financeiro/transacoes');
    await screen.findByRole('link', { name: /ASAAS_PRD · pay_1/ });
    expect(screen.getByText('vínculo pendente')).toBeInTheDocument();
  });

  it('sem transacao:vincular, nem o botão de retry nem o de pendentes aparecem', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver']));
    renderRota('/financeiro/transacoes/a1');
    await screen.findByText(/pendente de vínculo/);
    expect(screen.queryByRole('button', { name: /Tentar vincular/ })).not.toBeInTheDocument();
  });

  it('detalhe mostra o estado pendente e resolve ao clicar em "Tentar vincular"', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver', 'transacao:vincular'], { resolveOnRetry: true }));
    renderRota('/financeiro/transacoes/a1');
    await screen.findByText(/pendente de vínculo/);

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar vincular' }));

    await waitFor(() => {
      expect(screen.getByText(/Cobrança terceirizada/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /ver transação Guru/ })).toHaveAttribute(
      'href',
      '/financeiro/transacoes/g1',
    );
  });

  it('lista: botão "Tentar vincular pendentes" chama o endpoint em lote e mostra o resultado', async () => {
    vi.stubGlobal('fetch', servidor(['transacao:ver', 'transacao:vincular']));
    renderRota('/financeiro/transacoes');
    await screen.findByRole('link', { name: /ASAAS_PRD · pay_1/ });

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar vincular pendentes' }));

    await screen.findByText('1 de 1 resolvidos');
  });
});
