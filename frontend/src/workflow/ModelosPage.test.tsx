import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelosPage } from './ModelosPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const MODELO = {
  id: 'M1',
  nome: 'Boas-vindas a lead novo',
  descricao: 'Registra uma nota de boas-vindas.',
  gatilhoTipo: 'LEAD_CRIADO',
  condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
  acoes: [{ tipo: 'REGISTRAR_NOTA', conteudo: 'Lead novo — dar as boas-vindas.' }],
  criadoEm: '2026-09-09T00:00:00Z',
};

function servidor(perms: string[], usarMock?: ReturnType<typeof vi.fn>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url === '/crm/workflow/modelos') return ok({ itens: [MODELO] });
    if (url === '/crm/workflow/modelos/M1/usar-como-base' && method === 'POST') {
      usarMock?.(init);
      return ok({ id: 'F9', nome: 'clone', descricao: null, criadoPor: null, criadoEm: '2026-09-09T00:00:00Z', atualizadoEm: '2026-09-09T00:00:00Z', versaoPublicada: null, versaoRascunho: null }, 201);
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
            path: '/crm/workflow/modelos',
            element: (
              <RequirePermissao perm="crm_admin:ver">
                <ModelosPage />
              </RequirePermissao>
            ),
          },
          { path: '/crm/workflow/:id', element: <p>detalhe do fluxo</p> },
        ],
      },
    ],
    { initialEntries: ['/crm/workflow/modelos'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Workflow · biblioteca de modelos (spec 014)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista modelos semeados', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    expect(await screen.findByText('Boas-vindas a lead novo')).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_workflow → sem botão "Usar como base"', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    await screen.findByText('Boas-vindas a lead novo');
    expect(screen.queryByRole('button', { name: 'Usar como base' })).not.toBeInTheDocument();
  });

  it('usar como base clona e navega para o novo fluxo', async () => {
    const usarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_workflow'], usarMock));
    renderRota();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar como base' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar fluxo' }));
    await screen.findByText('detalhe do fluxo');
    expect(usarMock).toHaveBeenCalled();
  });
});
