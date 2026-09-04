import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsappAdminPage } from './WhatsappAdminPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const CANAL = {
  id: 'c1',
  nome: 'AEN comercial',
  numeroTelefone: '+5511912345678',
  wabaId: 'waba-1',
  phoneNumberId: 'phone-1',
  ativo: true,
  ultimoWebhookRecebidoEm: null,
  accessTokenDefinido: true,
  accessTokenMascarado: '••••••ab12',
  appSecretDefinido: true,
  appSecretMascarado: '••••••cd34',
  webhookVerifyTokenDefinido: true,
  webhookVerifyTokenMascarado: '••••••ef56',
  criadoEm: '2026-09-04T00:00:00Z',
  atualizadoEm: '2026-09-04T00:00:00Z',
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
    if (url.startsWith('/crm/admin/whatsapp/canais?') && method === 'GET')
      return ok({ itens: [CANAL], pagina: 1, tamanho: 25, total: 1 });
    if (url.startsWith('/crm/admin/whatsapp/canais/c1/templates?') && method === 'GET')
      return ok([]);
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/crm/whatsapp',
        element: (
          <RequirePermissao anyOf={['crm_admin:ver', 'whatsapp:ver']}>
            <WhatsappAdminPage />
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

describe('CRM · WhatsApp (spec 011)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista canais conectados, segredo só mascarado', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/whatsapp');
    expect(await screen.findByText('AEN comercial')).toBeInTheDocument();
    expect(await screen.findByText(/••••••ab12/)).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_whatsapp → sem form de conexão', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota('/crm/whatsapp');
    await screen.findByText('AEN comercial');
    expect(screen.queryByRole('button', { name: /Conectar canal/ })).not.toBeInTheDocument();
  });

  it('com crm_admin:gerir_whatsapp → aparece o form de conexão', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_whatsapp']));
    renderRota('/crm/whatsapp');
    expect(await screen.findByRole('button', { name: /Conectar canal/ })).toBeInTheDocument();
  });

  it('sem crm_admin:ver nem whatsapp:ver → "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor([]));
    renderRota('/crm/whatsapp');
    await waitFor(() =>
      expect(screen.getByText(/não tem permissão para acessar isto/i)).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem('pandora.token')).not.toBeNull();
  });
});
