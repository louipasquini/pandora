import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelinesPage } from './PipelinesPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const PIPELINE = { id: 'P1', nome: 'Mentoria', descricao: null, equipeId: null, modoAtribuicao: 'MANUAL', atribuicaoFallback: null, diasEsfriando: null, ativo: true };
const ETAPA_ABERTA = { id: 'E1', pipelineId: 'P1', nome: 'Novo contato', ordem: 0, tipo: 'ABERTA', slaHoras: null };
const ETAPA_PERDIDA = { id: 'E2', pipelineId: 'P1', nome: 'Perdido', ordem: 1, tipo: 'PERDIDA', slaHoras: null };
const OPORTUNIDADE = {
  id: 'O1',
  pipelineId: 'P1',
  etapaId: 'E1',
  pessoaId: null,
  leadId: 'L1',
  titulo: 'Mentoria 1:1',
  valorEstimado: { valorInt: '500000000', moeda: 'BRL' },
  responsavelId: null,
  dataPrevistaFechamento: null,
  entrouEtapaEm: '2026-09-04T00:00:00Z',
  status: 'ABERTA',
  slaEstourado: false,
  esfriando: false,
  criadoEm: '2026-09-04T00:00:00Z',
  atualizadoEm: '2026-09-04T00:00:00Z',
};

function servidor(perms: string[], moverMock?: ReturnType<typeof vi.fn>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.includes('/mover')) {
      moverMock?.(url, init);
      return ok({ ...OPORTUNIDADE, etapaId: 'E2', status: 'PERDIDA' });
    }
    if (url.match(/\/crm\/pipelines\/[^/]+\/etapas/)) return ok({ itens: [ETAPA_ABERTA, ETAPA_PERDIDA] });
    if (url.startsWith('/crm/oportunidades')) return ok({ itens: [OPORTUNIDADE], pagina: 1, tamanho: 25, total: 1 });
    if (url.startsWith('/crm/pipelines')) return ok({ itens: [PIPELINE] });
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
            path: '/crm/pipelines',
            element: (
              <RequirePermissao anyOf={['oportunidade:ver_todas', 'oportunidade:ver_proprias']}>
                <PipelinesPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/pipelines'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Pipelines (spec 010)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista pipelines e monta o board com as etapas e oportunidades', async () => {
    vi.stubGlobal('fetch', servidor(['oportunidade:ver_todas']));
    renderRota();
    expect(await screen.findByText('Novo contato (1)')).toBeInTheDocument();
    expect(screen.getByText('Mentoria 1:1')).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_pipelines → sem botão "Novo pipeline"', async () => {
    vi.stubGlobal('fetch', servidor(['oportunidade:ver_todas']));
    renderRota();
    await screen.findByText('Novo contato (1)');
    expect(screen.queryByRole('button', { name: /Novo pipeline/ })).not.toBeInTheDocument();
  });

  it('com crm_admin:gerir_pipelines → botão "Novo pipeline" e link "Administrar" aparecem', async () => {
    vi.stubGlobal('fetch', servidor(['oportunidade:ver_todas', 'crm_admin:gerir_pipelines']));
    renderRota();
    expect(await screen.findByRole('button', { name: /Novo pipeline/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Administrar/ })).toBeInTheDocument();
  });

  it('sem permissão nenhuma → tela "sem permissão"', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota();
    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
  });

  it('arrastar card para coluna PERDIDA abre modal; cancelar não chama a API', async () => {
    const moverMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['oportunidade:ver_todas', 'oportunidade:mover'], moverMock));
    renderRota();
    const card = await screen.findByTestId('oportunidade-O1');
    const colunaPerdida = screen.getByTestId('coluna-E2');

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'O1') };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(colunaPerdida, { dataTransfer });

    expect(await screen.findByText(/Motivo da perda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }));
    expect(moverMock).not.toHaveBeenCalled();
  });

  it('confirmar motivo chama a API de mover', async () => {
    const moverMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['oportunidade:ver_todas', 'oportunidade:mover'], moverMock));
    renderRota();
    const card = await screen.findByTestId('oportunidade-O1');
    const colunaPerdida = screen.getByTestId('coluna-E2');

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'O1') };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(colunaPerdida, { dataTransfer });

    await screen.findByText(/Motivo da perda/);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'sem orçamento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(moverMock).toHaveBeenCalled());
  });
});
