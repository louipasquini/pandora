import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtendimentoInboxPage } from './AtendimentoInboxPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const ATENDIMENTO = {
  id: 'at-1',
  pessoaId: 'p-1',
  leadId: null,
  canal: 'WHATSAPP',
  canalWhatsappId: 'canal-1',
  equipeId: null,
  atendenteAtualId: null,
  status: 'AGUARDANDO',
  prioridade: 'ALTA',
  abertoEm: '2026-09-04T10:00:00Z',
  primeiraRespostaEm: null,
  encerradoEm: null,
  encerradoPorId: null,
  motivoEncerramento: null,
  csatSolicitadoEm: null,
  sla: { estourado: true, minutosDecorridos: 60, minutosRestantes: null },
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace('http://localhost:3001', '');
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/atendimentos?') && method === 'GET') return ok({ itens: [ATENDIMENTO] });
    if (url === '/crm/atendimentos/at-1' && method === 'GET') return ok(ATENDIMENTO);
    if (url === '/crm/atendimentos/at-1/timeline' && method === 'GET') return ok({ itens: [] });
    if (url.startsWith('/crm/pessoas/p-1/interacoes') && method === 'GET')
      return ok({ itens: [], pagina: 1, tamanho: 25, total: 0 });
    return ok({ message: url }, 599);
  });
}

function renderRota() {
  const router = createMemoryRouter(
    [
      {
        path: '/crm/atendimentos',
        element: (
          <RequirePermissao anyOf={['atendimento:ver_todos', 'atendimento:ver_proprios']}>
            <AtendimentoInboxPage />
          </RequirePermissao>
        ),
      },
    ],
    { initialEntries: ['/crm/atendimentos'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Chat ao Vivo (spec 012)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista a fila com indicador de SLA estourado', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:ver_todos']));
    renderRota();
    expect(await screen.findByText(/Pessoa p-1/)).toBeInTheDocument();
    expect(await screen.findByText('SLA estourado')).toBeInTheDocument();
  });

  it('selecionar um item da fila abre a conversa', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:ver_todos']));
    renderRota();
    const item = await screen.findByText(/Pessoa p-1/);
    fireEvent.click(item);
    await waitFor(() => expect(screen.getByText(/Aguardando/)).toBeInTheDocument());
  });

  it('sem atendimento:atender → sem botão Assumir', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:ver_todos']));
    renderRota();
    fireEvent.click(await screen.findByText(/Pessoa p-1/));
    await waitFor(() => expect(screen.getByText(/Aguardando/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Assumir/ })).not.toBeInTheDocument();
  });

  it('com atendimento:atender → botão Assumir aparece', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:ver_todos', 'atendimento:atender']));
    renderRota();
    fireEvent.click(await screen.findByText(/Pessoa p-1/));
    expect(await screen.findByRole('button', { name: /Assumir/ })).toBeInTheDocument();
  });

  it('sem permissão nenhuma → "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor([]));
    renderRota();
    await waitFor(() => expect(screen.getByText(/não tem permissão para acessar isto/i)).toBeInTheDocument());
  });
});
