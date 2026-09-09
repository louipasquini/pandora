import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TarefaDetalhePage } from './TarefaDetalhePage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function tarefaBase(over: Record<string, unknown> = {}) {
  return {
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
    checklist: [{ id: 'I1', texto: 'Revisar histórico', concluido: false, ordem: 0 }],
    progressoChecklist: { concluidos: 0, total: 1 },
    tempoTotalSegundos: 0,
    vencendoHoje: false,
    atrasada: false,
    ...over,
  };
}

function servidor(perms: string[], opts: { statusMock?: ReturnType<typeof vi.fn> } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.endsWith('/crm/tarefas/T1/status') && init?.method === 'POST') {
      opts.statusMock?.(init);
      return ok(tarefaBase({ status: 'CONCLUIDA', concluidoEm: '2026-09-09T13:00:00Z' }));
    }
    if (url.includes('/checklist/') && init?.method === 'PATCH') {
      return ok({ id: 'I1', texto: 'Revisar histórico', concluido: true, ordem: 0 });
    }
    if (url.endsWith('/crm/tarefas/T1/notas')) return ok({ itens: [] });
    if (url.endsWith('/crm/tarefas/T1/dependencias')) return ok({ itens: [] });
    if (url.endsWith('/crm/tarefas/T1/delegacoes')) return ok({ itens: [] });
    if (url.endsWith('/crm/tarefas/T1')) return ok(tarefaBase());
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
            path: '/crm/tarefas/:id',
            element: (
              <RequirePermissao anyOf={['tarefa:ver_todas', 'tarefa:ver_proprias']}>
                <TarefaDetalhePage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/tarefas/T1'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Detalhe de Tarefa (spec 016)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('mostra checklist e progresso', async () => {
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias']));
    renderRota();
    expect(await screen.findByText('Revisar histórico')).toBeInTheDocument();
    expect(screen.getByText('Checklist (0/1)')).toBeInTheDocument();
  });

  it('sem tarefa:editar → sem botões de transição de status', async () => {
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias']));
    renderRota();
    await screen.findByText('Revisar histórico');
    expect(screen.queryByRole('button', { name: 'Concluída' })).not.toBeInTheDocument();
  });

  it('com tarefa:editar → concluir chama POST /status', async () => {
    const statusMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['tarefa:ver_proprias', 'tarefa:editar'], { statusMock }));
    renderRota();

    fireEvent.click(await screen.findByRole('button', { name: 'Concluída' }));
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
  });
});
