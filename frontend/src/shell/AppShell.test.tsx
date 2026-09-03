import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppShell } from './AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

/** US4: o shell tem cabeçalho, navegação e área de conteúdo. */
describe('AppShell', () => {
  function renderShell() {
    semearToken();
    const router = createMemoryRouter(
      [{ path: '/', element: <AppShell />, children: [{ index: true, element: <p>conteúdo</p> }] }],
      { initialEntries: ['/'] },
    );
    return render(
      <ComAuth>
        <RouterProvider router={router} />
      </ComAuth>,
    );
  }

  it('mostra o cabeçalho da marca', () => {
    renderShell();
    expect(screen.getByRole('banner')).toHaveTextContent(/projeto pandora/i);
  });

  it('mostra a navegação principal com os módulos', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: /navegação principal/i });
    expect(nav).toHaveTextContent('CRM');
    expect(nav).toHaveTextContent('Financeiro');
    expect(nav).toHaveTextContent('Marketing');
    expect(nav).toHaveTextContent('Central de Clientes');
  });

  it('renderiza a área de conteúdo roteável', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveTextContent('conteúdo');
  });
});
