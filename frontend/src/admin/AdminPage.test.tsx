import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, vi } from 'vitest';
import { AdminPage } from './AdminPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const CATALOGO = {
  recursos: [
    { recurso: 'perfil', permissoes: [{ id: 'perfil:administrar', rotulo: 'Administrar' }] },
    {
      recurso: 'lead',
      permissoes: [
        { id: 'lead:criar', rotulo: 'Criar leads' },
        { id: 'lead:editar', rotulo: 'Editar leads' },
      ],
    },
  ],
};

function servidorFake() {
  const perfis = [
    {
      id: 'sys',
      nome: 'Administrador',
      deSistema: true,
      permissoes: ['perfil:administrar', 'lead:criar', 'lead:editar'],
      permissoesDesconhecidas: [],
      totalUsuarios: 0,
    },
    {
      id: 'p-comercial',
      nome: 'Comercial',
      deSistema: false,
      permissoes: ['lead:criar'],
      permissoesDesconhecidas: [],
      totalUsuarios: 0,
    },
  ];
  const usuarios: {
    id: string;
    nome: string;
    email: string;
    perfis: { id: string; nome: string }[];
    criadoEm: string;
  }[] = [];
  const chamadas: string[] = [];

  const fetchFake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const path = url.replace('http://localhost:3001', '');
    chamadas.push(`${method} ${path}`);
    const ok = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

    if (path.includes('/auth/permissoes-efetivas')) {
      return ok({ permissoes: ['perfil:administrar', 'lead:criar', 'lead:editar'] });
    }
    if (path === '/admin/rbac/permissoes') return ok(CATALOGO);
    if (path === '/admin/rbac/perfis' && method === 'GET') return ok({ perfis });
    if (path === '/admin/rbac/usuarios' && method === 'GET') return ok({ usuarios });
    if (path === '/admin/rbac/usuarios' && method === 'POST') {
      const body = JSON.parse(String(init!.body)) as { nome: string; email: string };
      const u = { id: `u${usuarios.length + 1}`, ...body, perfis: [], criadoEm: '2026-09-03T00:00:00Z' };
      usuarios.push(u);
      return ok(u, 201);
    }
    if (/^\/admin\/rbac\/usuarios\/.+\/perfis$/.test(path) && method === 'PUT') {
      const { perfilIds } = JSON.parse(String(init!.body)) as { perfilIds: string[] };
      const alvo = usuarios.find((u) => path.includes(u.id))!;
      alvo.perfis = perfilIds.map((id) => ({ id, nome: perfis.find((p) => p.id === id)!.nome }));
      return ok({ perfis: alvo.perfis });
    }
    return ok({ message: `rota não mapeada: ${method} ${path}` }, 599);
  });

  return { fetchFake, chamadas };
}

function renderAdmin(aba: 'perfis' | 'usuarios') {
  const router = createMemoryRouter([{ path: '/admin', element: <AdminPage /> }], {
    initialEntries: [`/admin?aba=${aba}`],
  });
  return render(
    <ComAuth>
      <RouterProvider router={router} />
    </ComAuth>,
  );
}

describe('AdminPage (spec 004)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('aba Perfis: checklist agrupado por recurso; perfil de sistema é somente leitura', async () => {
    const { fetchFake } = servidorFake();
    vi.stubGlobal('fetch', fetchFake);
    renderAdmin('perfis');

    fireEvent.click(await screen.findByRole('button', { name: 'Ver' })); // linha do Administrador

    const painel = await screen.findByText(/Perfil: Administrador/i);
    expect(painel).toHaveTextContent(/somente leitura/i);

    // agrupado por recurso: legends "perfil" e "lead"
    expect(screen.getAllByText(/^(perfil|lead)$/).length).toBeGreaterThanOrEqual(2);

    // controles desabilitados (perfil de sistema): input de nome + <fieldset disabled>
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('group')).toBeDisabled();
    // e não há botão "Salvar" para perfil de sistema
    expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
  });

  it('aba Perfis: "marcar recurso" alterna todas as permissões do grupo', async () => {
    const { fetchFake } = servidorFake();
    vi.stubGlobal('fetch', fetchFake);
    renderAdmin('perfis');

    fireEvent.click(await screen.findByRole('button', { name: 'Novo perfil' }));
    await screen.findByText('Novo perfil', { selector: 'h3' });

    const leadGroup = screen.getByText('lead', { selector: 'label' });
    const groupCheckbox = within(leadGroup).getByRole('checkbox') as HTMLInputElement;
    expect(groupCheckbox.checked).toBe(false);
    fireEvent.click(groupCheckbox);

    const criar = screen.getByLabelText('Criar leads') as HTMLInputElement;
    const editar = screen.getByLabelText('Editar leads') as HTMLInputElement;
    expect(criar.checked).toBe(true);
    expect(editar.checked).toBe(true);
  });

  it('aba Usuários: cria usuário e atribui um perfil (POST + PUT)', async () => {
    const { fetchFake, chamadas } = servidorFake();
    vi.stubGlobal('fetch', fetchFake);
    renderAdmin('usuarios');

    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana Souza' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /criar usuário/i }));

    const linha = await screen.findByText('Ana Souza');
    const li = linha.closest('li')!;
    fireEvent.click(within(li).getByLabelText('Comercial'));
    fireEvent.click(within(li).getByRole('button', { name: /salvar perfis/i }));

    await waitFor(() => {
      expect(chamadas).toEqual(
        expect.arrayContaining([
          'POST /admin/rbac/usuarios',
          'PUT /admin/rbac/usuarios/u1/perfis',
        ]),
      );
    });
  });
});
