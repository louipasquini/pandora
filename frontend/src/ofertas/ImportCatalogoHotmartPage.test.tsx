import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportCatalogoHotmartPage } from './ImportCatalogoHotmartPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

function servidor() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), {
        status: s,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: ['oferta:editar'] });
    if (url === '/catalogo/hotmart/importar-produtos') {
      return ok({ processadas: 2, criadas: 2, atualizadas: 0, ignoradas: 0 });
    }
    return ok({ message: url }, 599);
  });
}

function renderRota() {
  const router = createMemoryRouter(
    [{ path: '/ofertas/importar-hotmart', element: <ImportCatalogoHotmartPage /> }],
    { initialEntries: ['/ofertas/importar-hotmart'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('Import catálogo Hotmart (spec 023)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('importa produtos.csv e mostra o resultado', async () => {
    vi.stubGlobal('fetch', servidor());
    renderRota();
    await screen.findByText('produtos.csv');

    const file = new File(['codigo,nome\nPCS,Programa\nNMX,Nutrição\n'], 'produtos.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('Arquivo produtos.csv'), {
      target: { files: [file] },
    });

    const botoes = screen.getAllByRole('button', { name: 'Importar' });
    fireEvent.click(botoes[0]);

    expect(await screen.findByText(/2 processadas · 2 criadas/)).toBeInTheDocument();
  });
});
