import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const DASHBOARD = {
  periodo: {
    de: '2026-08-11T00:00:00.000Z',
    ate: '2026-09-10T23:59:59.999Z',
    anteriorDe: '2026-07-12T00:00:00.000Z',
    anteriorAte: '2026-08-10T23:59:59.999Z',
    duracaoDias: 30,
    bucket: 'dia',
  },
  paineis: [
    {
      id: 'visao_geral',
      titulo: 'Visão geral',
      formato: 'numero',
      dados: {
        leadsNovos: { valor: 42, periodoAnterior: 30, delta: 12, deltaPercentual: 0.4 },
        oportunidadesCriadas: { valor: 5, periodoAnterior: 5, delta: 0, deltaPercentual: 0 },
        oportunidadesGanhas: { valor: 3, periodoAnterior: 1, delta: 2, deltaPercentual: 2 },
        oportunidadesPerdidas: { valor: 1, periodoAnterior: 2, delta: -1, deltaPercentual: -0.5 },
        valorEmAberto: [{ moeda: 'BRL', valorInt: '12500000000' }],
        taxaConversao: 0.75,
        tarefasConcluidasNoPrazo: { valor: 9, periodoAnterior: 7, delta: 2, deltaPercentual: 0.28 },
      },
    },
    {
      id: 'leads_por_origem',
      titulo: 'Leads por origem',
      formato: 'tabela',
      dados: {
        colunas: ['origem', 'leads', 'convertidos', 'taxaConversao'],
        linhas: [['instagram', 20, 6, 0.3]],
      },
    },
  ],
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/dashboard/notificacoes')) return ok({ itens: [] });
    if (url.startsWith('/crm/dashboard/visoes')) return ok({ itens: [] });
    if (url.startsWith('/crm/dashboard/metas')) return ok({ itens: [] });
    if (url.startsWith('/crm/dashboard')) return ok(DASHBOARD);
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
            path: '/crm/dashboard',
            element: (
              <RequirePermissao perm="dashboard:ver">
                <DashboardPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/dashboard'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Dashboard (spec 017)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('renderiza os painéis visíveis com o delta período-a-período', async () => {
    vi.stubGlobal('fetch', servidor(['dashboard:ver']));
    renderRota();
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText('Leads novos')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/\+12 \(40%\)/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Leads por origem' })).toBeInTheDocument();
    expect(screen.getByText('instagram')).toBeInTheDocument();
  });

  it('painel tabular tem botão Exportar CSV', async () => {
    vi.stubGlobal('fetch', servidor(['dashboard:ver']));
    renderRota();
    await screen.findByRole('heading', { name: 'Leads por origem' });
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('sem dashboard:gerir_metas → sem botão "Nova meta"', async () => {
    vi.stubGlobal('fetch', servidor(['dashboard:ver']));
    renderRota();
    await screen.findByText('Metas comerciais');
    expect(screen.queryByRole('button', { name: /Nova meta/ })).not.toBeInTheDocument();
  });

  it('com dashboard:gerir_metas → botão "Nova meta" aparece', async () => {
    vi.stubGlobal('fetch', servidor(['dashboard:ver', 'dashboard:gerir_metas']));
    renderRota();
    await screen.findByText('Metas comerciais');
    expect(await screen.findByRole('button', { name: /Nova meta/ })).toBeInTheDocument();
  });
});
