import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { routes } from './router';

/** US1 / FR-016: o app renderiza o conteúdo da rota "/" dentro do shell. */
describe('App', () => {
  it('renderiza a visão geral em "/"', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    const qc = new QueryClient();

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
    expect(screen.getByText(/esqueleto do painel pandora/i)).toBeInTheDocument();
  });
});
