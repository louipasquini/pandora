import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentosPage } from './SegmentosPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const SEGMENTO = {
  id: 'S1',
  nome: 'Leads quentes',
  descricao: null,
  alvo: 'LEAD',
  filtro: {},
  ativo: true,
  criadoPor: 'u1',
  criadoEm: '2026-09-04T00:00:00Z',
  atualizadoEm: '2026-09-04T00:00:00Z',
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
    if (url.startsWith('/crm/segmentos')) return ok({ itens: [SEGMENTO], pagina: 1, tamanho: 25, total: 1 });
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
            path: '/crm/segmentos',
            element: (
              <RequirePermissao perm="segmento:ver">
                <SegmentosPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/segmentos'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Segmentos (spec 009)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista monta do endpoint', async () => {
    vi.stubGlobal('fetch', servidor(['segmento:ver']));
    renderRota();
    expect(await screen.findByText('Leads quentes')).toBeInTheDocument();
  });

  it('sem segmento:gerir → sem botão "Novo segmento"', async () => {
    vi.stubGlobal('fetch', servidor(['segmento:ver']));
    renderRota();
    await screen.findByText('Leads quentes');
    expect(screen.queryByRole('button', { name: /Novo segmento/ })).not.toBeInTheDocument();
  });

  it('com segmento:gerir → botão "Novo segmento" aparece', async () => {
    vi.stubGlobal('fetch', servidor(['segmento:ver', 'segmento:gerir']));
    renderRota();
    expect(await screen.findByRole('button', { name: /Novo segmento/ })).toBeInTheDocument();
  });

  it('sem segmento:ver → tela "sem permissão"; item de nav some', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota();
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'CRM · Segmentos' })).not.toBeInTheDocument();
  });
});
