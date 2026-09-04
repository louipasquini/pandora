import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadsPage } from './LeadsPage';
import { LeadDetalhePage } from './LeadDetalhePage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const LEAD = {
  id: 'L1',
  nome: 'Ana Nutri',
  email: 'ana@x.com',
  telefone: null,
  documento: null,
  origem: 'formulario_lp',
  idExterno: null,
  utm: { source: null, medium: null, campaign: null, term: null, content: null },
  estagio: 'NOVO',
  status: 'ATIVO',
  responsavelId: null,
  tags: [],
  score: 31,
  scoreAtualizadoEm: null,
  pessoaId: null,
  convertidoEm: null,
  criadoEm: '2026-09-04T00:00:00Z',
  atualizadoEm: '2026-09-04T00:00:00Z',
  campos: {},
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
    if (/\/crm\/leads\/[^/]+\/auditoria/.test(url)) return ok({ itens: [], pagina: 1, tamanho: 25, total: 0 });
    if (/\/crm\/leads\/[^/]+$/.test(url)) return ok(LEAD);
    if (url.startsWith('/crm/leads?')) return ok({ itens: [LEAD], pagina: 1, tamanho: 25, total: 1 });
    if (url.startsWith('/crm/admin/campos-lead')) return ok([]);
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string, perm: 'todos' | 'proprios' | 'nenhum' | string[]) {
  const anyOf = ['lead:ver_todos', 'lead:ver_proprios'];
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          {
            path: '/crm/leads',
            element: (
              <RequirePermissao anyOf={anyOf}>
                <LeadsPage />
              </RequirePermissao>
            ),
          },
          {
            path: '/crm/leads/:id',
            element: (
              <RequirePermissao anyOf={anyOf}>
                <LeadDetalhePage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: [rota] },
  );
  void perm;
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Leads (spec 008)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista monta do endpoint', async () => {
    vi.stubGlobal('fetch', servidor(['lead:ver_todos']));
    renderRota('/crm/leads', 'todos');
    expect(await screen.findByText('Ana Nutri')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('sem lead:criar → sem botão "Novo lead"', async () => {
    vi.stubGlobal('fetch', servidor(['lead:ver_proprios']));
    renderRota('/crm/leads', 'proprios');
    await screen.findByText('Ana Nutri');
    expect(screen.queryByRole('button', { name: /Novo lead/ })).not.toBeInTheDocument();
  });

  it('sem lead:ver_* → tela "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota('/crm/leads', 'nenhum');
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
  });

  it('nav esconde "CRM · Leads" sem permissão de lead', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota('/crm/leads', 'nenhum');
    await screen.findByText(/não tem permissão/i);
    expect(screen.queryByRole('link', { name: 'CRM · Leads' })).not.toBeInTheDocument();
  });

  it('Converter em pessoa só com lead:editar + pessoa:editar e lead ATIVO', async () => {
    vi.stubGlobal('fetch', servidor(['lead:ver_todos', 'lead:editar', 'pessoa:editar']));
    renderRota('/crm/leads/L1', ['lead:ver_todos']);
    expect(
      await screen.findByRole('button', { name: /Converter em pessoa/ }),
    ).toBeInTheDocument();
  });

  it('sem pessoa:editar → sem botão Converter', async () => {
    vi.stubGlobal('fetch', servidor(['lead:ver_todos', 'lead:editar']));
    renderRota('/crm/leads/L1', ['lead:ver_todos']);
    await screen.findByText('Ana Nutri');
    expect(
      screen.queryByRole('button', { name: /Converter em pessoa/ }),
    ).not.toBeInTheDocument();
  });
});
