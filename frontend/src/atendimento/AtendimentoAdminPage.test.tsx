import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtendimentoAdminPage } from './AtendimentoAdminPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const EQUIPE = {
  id: 'e-1',
  nome: 'Atendimento Geral',
  tipo: 'ATENDIMENTO',
  ativo: true,
  totalMembrosAtivos: 2,
  criadoEm: '2026-09-04T00:00:00Z',
  atualizadoEm: '2026-09-04T00:00:00Z',
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace('http://localhost:3001', '');
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/admin/equipes?') && method === 'GET')
      return ok({ itens: [EQUIPE], pagina: 1, tamanho: 25, total: 1 });
    if (url === '/crm/admin/atendimento/equipes/e-1' && method === 'GET')
      return ok({ slaPrimeiraRespostaMinutos: 15, mensagemForaExpediente: 'Voltamos às 9h!' });
    return ok({ message: url }, 599);
  });
}

function renderRota() {
  const router = createMemoryRouter(
    [
      {
        path: '/crm/atendimentos/admin',
        element: (
          <RequirePermissao perm="crm_admin:gerir_atendimento">
            <AtendimentoAdminPage />
          </RequirePermissao>
        ),
      },
    ],
    { initialEntries: ['/crm/atendimentos/admin'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Chat ao Vivo — Administração (spec 012)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista a equipe com o SLA e mensagem configurados', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:gerir_atendimento']));
    renderRota();
    expect(await screen.findByText('Atendimento Geral')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('15')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Voltamos às 9h!')).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_atendimento → "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor([]));
    renderRota();
    await waitFor(() => expect(screen.getByText(/não tem permissão para acessar isto/i)).toBeInTheDocument());
  });
});
