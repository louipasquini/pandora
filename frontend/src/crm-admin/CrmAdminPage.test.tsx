import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmAdminPage } from './CrmAdminPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const EQUIPE = {
  id: 'e1',
  nome: 'Comercial – Alto Ticket',
  tipo: 'COMERCIAL',
  ativo: true,
  totalMembrosAtivos: 3,
  criadoEm: '2026-09-03T00:00:00Z',
  atualizadoEm: '2026-09-03T00:00:00Z',
};
const INTEGRACAO = {
  id: 'i1',
  nome: 'Webhook Guru',
  tipo: 'WEBHOOK',
  alvo: 'EXTERNO',
  config: {},
  ativo: true,
  ultimoUsoEm: null,
  segredoDefinido: true,
  segredoMascarado: '••••••9f3c',
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), {
        status: s,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/admin/equipes?') && method === 'GET')
      return ok({ itens: [EQUIPE], pagina: 1, tamanho: 25, total: 1 });
    if (url.startsWith('/crm/admin/integracoes?') && method === 'GET')
      return ok({ itens: [INTEGRACAO], pagina: 1, tamanho: 25, total: 1 });
    if (url.startsWith('/crm/admin/janelas-atendimento?')) return ok({ itens: [] });
    if (url.startsWith('/crm/admin/feriados?')) return ok({ itens: [] });
    if (url.startsWith('/crm/admin/expediente?'))
      return ok({ emExpediente: true, instante: '2026-09-09T17:00:00Z', equipeId: null });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/crm/admin',
        element: (
          <RequirePermissao perm="crm_admin:ver">
            <CrmAdminPage />
          </RequirePermissao>
        ),
      },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Administração (spec 007)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('aba Equipes lista do endpoint', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/admin?tab=equipes');
    expect(await screen.findByText('Comercial – Alto Ticket')).toBeInTheDocument();
  });

  it('sem gerir_equipes → aba Equipes é somente-leitura', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/admin?tab=equipes');
    await screen.findByText('Comercial – Alto Ticket');
    expect(
      screen.queryByRole('button', { name: /Criar equipe/ }),
    ).not.toBeInTheDocument();
  });

  it('com gerir_equipes → aparece o form de criação', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_equipes']));
    renderRota('/crm/admin?tab=equipes');
    expect(
      await screen.findByRole('button', { name: /Criar equipe/ }),
    ).toBeInTheDocument();
  });

  it('aba Integrações mostra só a máscara, nunca o valor', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/admin?tab=integracoes');
    expect(await screen.findByText(/••••••9f3c/)).toBeInTheDocument();
  });

  it('aba Expediente mostra o indicador "no expediente agora"', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/admin?tab=expediente');
    expect(await screen.findByText(/No expediente agora/)).toBeInTheDocument();
  });

  it('sem crm_admin:ver → "sem permissão", não Login', async () => {
    vi.stubGlobal('fetch', servidor([]));
    renderRota('/crm/admin');
    await waitFor(() =>
      expect(
        screen.getByText(/não tem permissão para acessar isto/i),
      ).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem('pandora.token')).not.toBeNull();
  });
});
