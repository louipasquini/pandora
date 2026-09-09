import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisparosPage } from './DisparosPage';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AppShell } from '../shell/AppShell';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const CANAL = { id: 'C1', nome: 'Canal principal' };
const SEGMENTO = { id: 'S1', nome: 'Interessados', alvo: 'LEAD' };
const TEMPLATE = { id: 'T1', nomeMeta: 'tpl_lancamento', statusAprovacao: 'APROVADO' };
const DISPARO = {
  id: 'D1',
  nome: 'Disparo teste',
  status: 'EM_ANDAMENTO',
  agendadoPara: null,
  erroDetalhe: null,
  contagens: [{ status: 'ENVIADA', total: 3 }],
};

function servidor(perms: string[], criarMock?: ReturnType<typeof vi.fn>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/admin/whatsapp/canais/') && url.includes('/templates')) {
      return ok([TEMPLATE]);
    }
    if (url.startsWith('/crm/admin/whatsapp/canais')) return ok({ itens: [CANAL] });
    if (url.startsWith('/crm/segmentos')) return ok({ itens: [SEGMENTO] });
    if (url.startsWith('/crm/disparos') && init?.method === 'POST') {
      criarMock?.(url, init);
      return ok(DISPARO, 201);
    }
    if (url.startsWith('/crm/disparos')) return ok({ itens: [DISPARO], pagina: 1, tamanho: 25, total: 1 });
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
            path: '/crm/disparos',
            element: (
              <RequirePermissao perm="disparo:ver">
                <DisparosPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/crm/disparos'] },
  );
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('CRM · Disparos (spec 015)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista disparos com status e contagem de enviadas', async () => {
    vi.stubGlobal('fetch', servidor(['disparo:ver']));
    renderRota();
    expect(await screen.findByText('Disparo teste')).toBeInTheDocument();
    expect(screen.getByText(/Em andamento · 3 enviadas/)).toBeInTheDocument();
  });

  it('sem disparo:criar → sem botão "Novo disparo"', async () => {
    vi.stubGlobal('fetch', servidor(['disparo:ver']));
    renderRota();
    await screen.findByText('Disparo teste');
    expect(screen.queryByRole('button', { name: /Novo disparo/ })).not.toBeInTheDocument();
  });

  it('com disparo:criar → monta e envia o formulário de criação', async () => {
    const criarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['disparo:ver', 'disparo:criar'], criarMock));
    renderRota();

    fireEvent.click(await screen.findByRole('button', { name: /Novo disparo/ }));
    fireEvent.change(screen.getByLabelText('Nome do disparo'), {
      target: { value: 'Campanha X' },
    });

    const selectCanal = (await screen.findByLabelText('Canal')) as HTMLSelectElement;
    await waitFor(() => expect(selectCanal.querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(selectCanal, { target: { value: 'C1' } });
    const selectTemplate = (await screen.findByLabelText('Template')) as HTMLSelectElement;
    await waitFor(() => expect(selectTemplate.querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(selectTemplate, { target: { value: 'T1' } });
    const selectSegmento = screen.getByLabelText('Segmento') as HTMLSelectElement;
    await waitFor(() => expect(selectSegmento.querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(selectSegmento, { target: { value: 'S1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo' }));

    await waitFor(() => expect(criarMock).toHaveBeenCalled());
  });

  it('sem segmento nem CSV → mostra erro e não chama a API', async () => {
    const criarMock = vi.fn();
    vi.stubGlobal('fetch', servidor(['disparo:ver', 'disparo:criar'], criarMock));
    renderRota();

    fireEvent.click(await screen.findByRole('button', { name: /Novo disparo/ }));
    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Campanha X' } });
    const selectCanal2 = (await screen.findByLabelText('Canal')) as HTMLSelectElement;
    await waitFor(() => expect(selectCanal2.querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(selectCanal2, { target: { value: 'C1' } });
    const selectTemplate = (await screen.findByLabelText('Template')) as HTMLSelectElement;
    await waitFor(() => expect(selectTemplate.querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(selectTemplate, { target: { value: 'T1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar disparo' }));

    expect(await screen.findByText(/escolha um segmento ou importe um CSV/)).toBeInTheDocument();
    expect(criarMock).not.toHaveBeenCalled();
  });
});
