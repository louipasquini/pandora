import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaqAdminPage } from './FaqAdminPage';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

const ITEM = {
  id: 'f1',
  pergunta: 'Qual o prazo de acesso?',
  resposta: '12 meses.',
  ativo: true,
  criadoEm: '2026-09-09T00:00:00Z',
  atualizadoEm: '2026-09-09T00:00:00Z',
};

function servidor(perms: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.startsWith('/crm/admin/faq') && method === 'GET') return ok({ itens: [ITEM] });
    if (url.startsWith('/crm/admin/faq') && method === 'POST')
      return ok({ ...ITEM, id: 'f2', pergunta: 'nova', resposta: 'resposta' }, 201);
    return ok({ message: url }, 599);
  });
}

describe('CRM · Administração · FAQ (spec 013)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lista itens de FAQ existentes', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    render(
      <ComAuth>
        <FaqAdminPage />
      </ComAuth>,
    );
    expect(await screen.findByText('Qual o prazo de acesso?')).toBeInTheDocument();
  });

  it('sem crm_admin:gerir_faq → sem form de criação', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver']));
    render(
      <ComAuth>
        <FaqAdminPage />
      </ComAuth>,
    );
    await screen.findByText('Qual o prazo de acesso?');
    expect(screen.queryByRole('button', { name: /^Criar$/ })).not.toBeInTheDocument();
  });

  it('com crm_admin:gerir_faq → form de criação aparece', async () => {
    vi.stubGlobal('fetch', servidor(['crm_admin:ver', 'crm_admin:gerir_faq']));
    render(
      <ComAuth>
        <FaqAdminPage />
      </ComAuth>,
    );
    expect(await screen.findByRole('button', { name: /^Criar$/ })).toBeInTheDocument();
  });

  it('lista vazia mostra mensagem apropriada', async () => {
    const s = vi.fn(async (input: RequestInfo | URL) => {
      const url = (typeof input === 'string' ? input : input.toString()).replace(
        'http://localhost:3001',
        '',
      );
      const ok = (b: unknown) =>
        new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: ['crm_admin:ver'] });
      if (url.startsWith('/crm/admin/faq')) return ok({ itens: [] });
      return ok({});
    });
    vi.stubGlobal('fetch', s);
    render(
      <ComAuth>
        <FaqAdminPage />
      </ComAuth>,
    );
    await waitFor(() =>
      expect(screen.getByText('Nenhum item de FAQ cadastrado.')).toBeInTheDocument(),
    );
  });
});
