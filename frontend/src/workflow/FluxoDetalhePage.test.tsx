import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluxoDetalhePage } from './FluxoDetalhePage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const RASCUNHO = {
  id: 'V2',
  numero: 2,
  status: 'RASCUNHO',
  gatilhoTipo: 'LEAD_CRIADO',
  condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
  acoes: [{ tipo: 'APLICAR_TAG', tag: 'tag-alvo' }],
  autor: null,
  publicadoPor: null,
  publicadoEm: null,
  arquivadoPor: null,
  arquivadoEm: null,
  criadoEm: '2026-09-09T00:00:00Z',
  atualizadoEm: '2026-09-09T00:00:00Z',
};

const FLUXO = {
  id: 'F1',
  nome: 'Lead do site',
  descricao: null,
  criadoPor: null,
  criadoEm: '2026-09-09T00:00:00Z',
  atualizadoEm: '2026-09-09T00:00:00Z',
  versaoPublicada: null,
  versaoRascunho: RASCUNHO,
};

function servidor(
  perms: string[],
  mocks: { rascunho?: ReturnType<typeof vi.fn>; publicar?: ReturnType<typeof vi.fn> } = {},
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url === '/crm/workflow/fluxos/F1' && method === 'GET') return ok(FLUXO);
    if (url === '/crm/workflow/fluxos/F1/execucoes') return ok({ itens: [] });
    if (url === '/crm/workflow/fluxos/F1/rascunho' && method === 'PUT') {
      mocks.rascunho?.(init);
      return ok(RASCUNHO);
    }
    if (url === '/crm/workflow/fluxos/F1/publicar' && method === 'POST') {
      mocks.publicar?.();
      return ok({ ...RASCUNHO, status: 'PUBLICADA' });
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
            path: '/crm/workflow/:id',
            element: (
              <RequirePermissao perm="crm_admin:ver">
                <FluxoDetalhePage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/workflow/F1'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Workflow · editor de fluxo (spec 014)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('carrega o rascunho existente no editor', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    expect(await screen.findByText('Lead do site')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('site')).toBeInTheDocument(); // valor da condição
    expect(screen.getByDisplayValue('tag-alvo')).toBeInTheDocument(); // tag da ação
  });

  it('sem crm_admin:gerir_workflow → campos desabilitados, sem botões de escrita', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    await screen.findByText('Lead do site');
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Gatilho')).toBeDisabled();
  });

  it('salvar rascunho envia gatilho/condições/ações', async () => {
    const rascunhoMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_workflow'], { rascunho: rascunhoMock }));
    renderRota();
    await screen.findByText('Lead do site');
    // espera o rascunho carregado (efeito assíncrono) antes de salvar, senão
    // o clique pode acontecer entre o fetch resolver e o estado ser populado.
    await screen.findByDisplayValue('tag-alvo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await vi.waitFor(() => expect(rascunhoMock).toHaveBeenCalled());
    const body = JSON.parse((rascunhoMock.mock.calls[0][0] as RequestInit).body as string);
    expect(body.gatilhoTipo).toBe('LEAD_CRIADO');
    expect(body.acoes).toEqual([{ tipo: 'APLICAR_TAG', tag: 'tag-alvo' }]);
  });

  it('publicar chama a API quando há rascunho', async () => {
    const publicarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_workflow'], { publicar: publicarMock }));
    renderRota();
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await vi.waitFor(() => expect(publicarMock).toHaveBeenCalled());
  });

  it('aba Execuções mostra "nenhuma execução ainda"', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    renderRota();
    await screen.findByText('Lead do site');
    fireEvent.click(screen.getByRole('button', { name: 'Execuções' }));
    expect(await screen.findByText('nenhuma execução ainda')).toBeInTheDocument();
  });
});
