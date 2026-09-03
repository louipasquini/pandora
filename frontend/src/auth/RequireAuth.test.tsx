import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RequireAuth } from './RequireAuth';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function renderRotas(entrada: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>tela de login</p> },
      {
        path: '/',
        element: <RequireAuth />,
        children: [{ index: true, element: <p>área protegida</p> }],
      },
    ],
    { initialEntries: [entrada] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('sem sessão → redireciona para /login', async () => {
    renderRotas('/');
    expect(await screen.findByText(/tela de login/i)).toBeInTheDocument();
    expect(screen.queryByText(/área protegida/i)).not.toBeInTheDocument();
  });

  it('com sessão válida → renderiza a área protegida', async () => {
    semearToken();
    renderRotas('/');
    expect(await screen.findByText(/área protegida/i)).toBeInTheDocument();
  });
});
