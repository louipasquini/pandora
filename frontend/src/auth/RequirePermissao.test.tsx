import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, vi } from 'vitest';
import { RequirePermissao } from './RequirePermissao';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function mockEfetivas(permissoes: string[] | { status: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/permissoes-efetivas')) {
        if ('status' in (permissoes as { status: number })) {
          return new Response('{}', { status: (permissoes as { status: number }).status });
        }
        return new Response(JSON.stringify({ permissoes }), { status: 200 });
      }
      return new Response('{}', { status: 599 });
    }),
  );
}

function renderRota(perm: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <RequirePermissao perm={perm}>
            <p>conteúdo protegido</p>
          </RequirePermissao>
        ),
      },
      { path: '/login', element: <p>tela de login</p> },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('RequirePermissao (spec 004)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('com a permissão → renderiza o conteúdo', async () => {
    mockEfetivas(['perfil:administrar']);
    renderRota('perfil:administrar');
    expect(await screen.findByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('sem a permissão → tela "sem permissão", não vai para /login', async () => {
    mockEfetivas(['lead:criar']);
    renderRota('perfil:administrar');
    expect(
      await screen.findByRole('heading', { name: /não tem permissão/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('403 na chamada de efetivas → tratado como sem permissão', async () => {
    mockEfetivas({ status: 403 });
    renderRota('perfil:administrar');
    expect(
      await screen.findByRole('heading', { name: /não tem permissão/i }),
    ).toBeInTheDocument();
  });
});
