import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventosListPage } from './EventosListPage';
import { EventoDetailPage } from './EventoDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const EVENTO_REVISAR = {
  id: 'ev1',
  plataformaOrigem: 'GURU_PRD',
  tipoOrigem: 'webhook_venda',
  idOrigem: 'txn_1',
  status: 'revisar',
  classificacao: 'DESCONHECIDO',
  erroDetalhe: 'sem EventoCanonico',
  recebidoEm: '2026-09-03T12:00:00Z',
  reentregas: 0,
};

function servidor(perms: string[], opts: { reprocessarStatus?: number } = {}) {
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
    if (url.startsWith('/ingestao/eventos?') && method === 'GET') {
      const soRevisarErro = url.includes('status=revisar%2Cerro');
      return ok({
        itens: soRevisarErro ? [EVENTO_REVISAR] : [EVENTO_REVISAR, { ...EVENTO_REVISAR, id: 'ev2', status: 'ok' }],
        pagina: 1,
        tamanho: 25,
        total: soRevisarErro ? 1 : 2,
      });
    }
    if (/^\/ingestao\/eventos\/ev1$/.test(url) && method === 'GET')
      return ok({
        ...EVENTO_REVISAR,
        hash: 'abc',
        ultimoRecebidoEm: '2026-09-03T12:00:00Z',
        payloadBruto: { id: 'txn_1' },
        eventoCanonico: null,
        etapas: [
          { etapa: 'REGISTRAR', status: 'ok', resultado: null, erroDetalhe: null, tentativas: 0, executadoEm: null },
          {
            etapa: 'CLASSIFICAR',
            status: 'ok',
            resultado: { classificacao: 'DESCONHECIDO', revisar: true },
            erroDetalhe: null,
            tentativas: 0,
            executadoEm: null,
          },
          { etapa: 'RESOLVER_PESSOA', status: 'pulada', resultado: { implementadaNa: 18 }, erroDetalhe: null, tentativas: 0, executadoEm: null },
        ],
      });
    if (/^\/ingestao\/eventos\/ev1\/reprocessar$/.test(url) && method === 'POST')
      return ok({ eventoId: 'ev1', etapasReenfileiradas: ['CLASSIFICAR'] }, opts.reprocessarStatus ?? 200);
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/eventos', element: <EventosListPage /> },
      { path: '/eventos/:id', element: <EventoDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Eventos (spec 006)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista carrega com o filtro default revisar/erro', async () => {
    vi.stubGlobal('fetch', servidor(['evento:ver']));
    renderRota('/eventos');
    expect(
      await screen.findByRole('link', { name: /GURU_PRD · webhook_venda/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sem EventoCanonico/)).toBeInTheDocument();
  });

  it('detalhe mostra a linha do tempo das etapas e o payload bruto', async () => {
    vi.stubGlobal('fetch', servidor(['evento:ver']));
    renderRota('/eventos/ev1');
    expect(await screen.findByText('CLASSIFICAR')).toBeInTheDocument();
    expect(screen.getByText('RESOLVER_PESSOA')).toBeInTheDocument();
    expect(screen.getByText(/"id": "txn_1"/)).toBeInTheDocument();
  });

  it('Reprocessar só aparece com evento:reprocessar', async () => {
    vi.stubGlobal('fetch', servidor(['evento:ver']));
    const { unmount } = renderRota('/eventos/ev1');
    await screen.findByText('CLASSIFICAR');
    expect(screen.queryByRole('button', { name: /Reprocessar/ })).not.toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', servidor(['evento:ver', 'evento:reprocessar']));
    renderRota('/eventos/ev1');
    await screen.findByText('CLASSIFICAR');
    const btn = await screen.findByRole('button', { name: 'Reprocessar' });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.queryByText('Reprocessando…')).not.toBeInTheDocument(),
    );
  });

  it('403 numa chamada não desloga (banner tratado pelo apiFetch)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = (typeof input === 'string' ? input : input.toString()).replace(
        'http://localhost:3001',
        '',
      );
      if (url.includes('/auth/permissoes-efetivas'))
        return new Response(JSON.stringify({ permissoes: ['evento:ver'] }), { status: 200 });
      return new Response(JSON.stringify({ message: 'permissão insuficiente' }), {
        status: 403,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderRota('/eventos');
    await screen.findByText(/Não foi possível carregar os eventos\.|Nenhum evento/);
    expect(window.localStorage.getItem('pandora.token')).not.toBeNull();
  });
});
