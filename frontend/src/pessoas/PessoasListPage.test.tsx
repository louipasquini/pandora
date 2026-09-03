import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, vi } from 'vitest';
import { PessoasListPage } from './PessoasListPage';
import { PessoaDetailPage } from './PessoaDetailPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const PESSOA = {
  id: 'p1',
  nome: 'Maria Souza',
  tipo: 'FISICA',
  pseudonimizadaEm: null,
  conta: null,
  emails: [
    { valor: 'maria@x.com', primario: true, curado: true, rebaixadoEm: null },
    { valor: 'antiga@x.com', primario: false, curado: false, rebaixadoEm: '2026-08-01T00:00:00Z' },
  ],
  telefones: [],
  documentos: [],
  enderecos: [],
  origemRefs: [{ plataformaOrigem: 'GURU_PRD', tipoRef: 'guru_customer_id', valorRef: 'cus_9' }],
  merges: [],
};

function servidor(perms: string[], overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/pessoas?') && method === 'GET')
      return ok({ itens: [{ ...PESSOA, emailPrimario: 'maria@x.com', telefonePrimario: null, documentos: [], contaId: null, unificada: false }], pagina: 1, tamanho: 25, total: 1 });
    if (/^\/pessoas\/p1$/.test(url)) return ok({ ...PESSOA, ...overrides });
    return ok({ message: url }, 599);
  });
}

function renderRota(rota: string) {
  const router = createMemoryRouter(
    [
      { path: '/pessoas', element: <PessoasListPage /> },
      { path: '/pessoas/:id', element: <PessoaDetailPage /> },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Pessoas (spec 005)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista carrega e "Nova pessoa" só aparece com pessoa:editar', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota('/pessoas');
    expect(await screen.findByRole('link', { name: 'Maria Souza' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova pessoa' })).not.toBeInTheDocument();
  });

  it('com pessoa:editar mostra "Nova pessoa"', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver', 'pessoa:editar']));
    renderRota('/pessoas');
    await screen.findByRole('link', { name: 'Maria Souza' });
    expect(screen.getByRole('button', { name: 'Nova pessoa' })).toBeInTheDocument();
  });

  it('detalhe: primário destacado, secundário datado, badge curado', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota('/pessoas/p1');
    expect(await screen.findByText('maria@x.com')).toBeInTheDocument();
    expect(screen.getAllByText('primário').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/secundário desde/)).toBeInTheDocument();
    expect(screen.getAllByText('curado').length).toBeGreaterThanOrEqual(1);
  });

  it('detalhe de pessoa unificada mostra o aviso', async () => {
    vi.stubGlobal(
      'fetch',
      servidor(['pessoa:ver'], { unificacao: { deId: 'pX', em: '2026-09-01T00:00:00Z', mergeId: 'm1' } }),
    );
    renderRota('/pessoas/p1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/unificada/i);
  });

  it('sem pessoa:merge não mostra o botão Unificar', async () => {
    vi.stubGlobal('fetch', servidor(['pessoa:ver']));
    renderRota('/pessoas/p1');
    await screen.findByText('maria@x.com');
    expect(screen.queryByRole('button', { name: 'Unificar' })).not.toBeInTheDocument();
  });

  it('403 numa chamada não desloga (token permanece)', async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = (typeof input === 'string' ? input : input.toString()).replace(
        'http://localhost:3001',
        '',
      );
      if (url.includes('/auth/permissoes-efetivas'))
        return new Response(JSON.stringify({ permissoes: ['pessoa:ver'] }), { status: 200 });
      return new Response(JSON.stringify({ message: 'sem permissão' }), { status: 403 });
    });
    vi.stubGlobal('fetch', f);
    renderRota('/pessoas');
    await waitFor(() =>
      expect(window.localStorage.getItem('pandora.token')).not.toBeNull(),
    );
  });
});
