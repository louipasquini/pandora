import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TarefasPage } from './TarefasPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const TAREFA = {
  id: 'T1',
  titulo: 'Ligar para retomar negociação',
  descricao: null,
  status: 'PENDENTE',
  dataVencimento: null,
  concluidoEm: null,
  pessoaId: null,
  leadId: null,
  oportunidadeId: null,
  responsavelId: 'pandora-panel',
  criadoPorId: 'pandora-panel',
  origem: 'manual',
  criadoEm: '2026-09-09T12:00:00Z',
  atualizadoEm: '2026-09-09T12:00:00Z',
  checklist: [],
  progressoChecklist: { concluidos: 0, total: 0 },
  tempoTotalSegundos: 0,
  vencendoHoje: false,
  atrasada: false,
};

function servidor(perms: string[], criarMock?: ReturnType<typeof vi.fn>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/tarefas/notificacoes')) return ok({ itens: [] });
    if (url.startsWith('/crm/tarefas/ranking')) return ok([]);
    if (url.startsWith('/crm/tarefas') && init?.method === 'POST') {
      criarMock?.(url, init);
      return ok(TAREFA, 201);
    }
    if (url.startsWith('/crm/tarefas')) {
      return ok({ itens: [TAREFA], pagina: 1, tamanho: 25, total: 1 });
    }
    return ok({ message: url }, 599);
  });
}

function renderRota() {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          {
            path: '/crm/tarefas',
            element: (
              <RequirePermissao anyOf={['tarefa:ver_todas', 'tarefa:ver_proprias']}>
                <TarefasPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/tarefas'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Tarefas (spec 016)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista tarefas com status e progresso de checklist', async () => {
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias']));
    renderRota();
    expect(await screen.findByText('Ligar para retomar negociação')).toBeInTheDocument();
  });

  it('sem tarefa:criar → sem botão "Nova tarefa"', async () => {
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias']));
    renderRota();
    await screen.findByText('Ligar para retomar negociação');
    expect(screen.queryByRole('button', { name: /Nova tarefa/ })).not.toBeInTheDocument();
  });

  it('com tarefa:criar → monta e envia o formulário de criação', async () => {
    const criarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias', 'tarefa:criar'], criarMock));
    renderRota();

    fireEvent.click(await screen.findByRole('button', { name: /Nova tarefa/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Nova tarefa de teste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(criarMock).toHaveBeenCalled());
  });

  it('abas Minhas/Gerais aparecem; Todas só com tarefa:ver_todas', async () => {
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias']));
    renderRota();
    await screen.findByText('Ligar para retomar negociação');
    expect(screen.getByRole('button', { name: 'Minhas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerais' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Todas' })).not.toBeInTheDocument();
  });
});
