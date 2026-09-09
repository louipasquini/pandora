import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluxosPage } from './FluxosPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const FLUXO_PUBLICADO = {
  id: 'F1',
  nome: 'Lead do site',
  descricao: null,
  criadoPor: null,
  criadoEm: '2026-09-09T00:00:00Z',
  atualizadoEm: '2026-09-09T00:00:00Z',
  versaoPublicada: {
    id: 'V1',
    numero: 1,
    status: 'PUBLICADA',
    gatilhoTipo: 'LEAD_CRIADO',
    condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
    acoes: [{ tipo: 'APLICAR_TAG', tag: 'site' }],
    autor: null,
    publicadoPor: 'sistema',
    publicadoEm: '2026-09-09T00:00:00Z',
    arquivadoPor: null,
    arquivadoEm: null,
    criadoEm: '2026-09-09T00:00:00Z',
    atualizadoEm: '2026-09-09T00:00:00Z',
  },
  versaoRascunho: null,
};

function servidor(perms: string[], criarMock?: ReturnType<typeof vi.fn>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url === '/crm/workflow/fluxos' && method === 'GET') return ok({ itens: [FLUXO_PUBLICADO] });
    if (url === '/crm/workflow/fluxos' && method === 'POST') {
      criarMock?.(init);
      return ok({ ...FLUXO_PUBLICADO, id: 'F2', nome: 'Novo fluxo', versaoPublicada: null }, 201);
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
            path: '/crm/workflow',
            element: (
              <RequirePermissao perm="crm_admin:ver">
                <FluxosPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/workflow'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Workflow · lista de fluxos (spec 014)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista fluxos existentes com status derivado', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    expect(await screen.findByText('Lead do site')).toBeInTheDocument();
    expect(screen.getByText(/publicado/)).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_workflow → sem botão "Novo fluxo"', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    await screen.findByText('Lead do site');
    expect(screen.queryByRole('button', { name: /Novo fluxo/ })).not.toBeInTheDocument();
  });

  it('com permissão, criar um fluxo novo chama a API', async () => {
    const criarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_workflow'], criarMock));
    renderRota();
    fireEvent.click(await screen.findByRole('button', { name: /Novo fluxo/ }));
    fireEvent.change(screen.getByLabelText('Nome do fluxo'), { target: { value: 'Meu fluxo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await screen.findByText('Lead do site'); // lista recarrega
    expect(criarMock).toHaveBeenCalled();
  });

  it('sem permissão nenhuma → tela "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota();
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
  });
});
