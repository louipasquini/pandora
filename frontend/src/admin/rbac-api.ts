import { apiFetch } from '../auth/api-client';

export interface RecursoAgrupado {
  recurso: string;
  permissoes: { id: string; rotulo: string }[];
}
export interface Perfil {
  id: string;
  nome: string;
  deSistema: boolean;
  permissoes: string[];
  permissoesDesconhecidas: string[];
  totalUsuarios: number;
}
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfis: { id: string; nome: string }[];
  criadoEm: string;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export const rbacApi = {
  async getPermissoes(): Promise<RecursoAgrupado[]> {
    const res = await apiFetch('/admin/rbac/permissoes');
    return (await json<{ recursos: RecursoAgrupado[] }>(res)).recursos;
  },
  async getPerfis(): Promise<Perfil[]> {
    const res = await apiFetch('/admin/rbac/perfis');
    return (await json<{ perfis: Perfil[] }>(res)).perfis;
  },
  async criarPerfil(nome: string, permissoes: string[]): Promise<Perfil> {
    const res = await apiFetch('/admin/rbac/perfis', {
      method: 'POST',
      body: JSON.stringify({ nome, permissoes }),
    });
    return json<Perfil>(res);
  },
  async editarPerfil(
    id: string,
    dados: { nome?: string; permissoes?: string[] },
  ): Promise<Perfil> {
    const res = await apiFetch(`/admin/rbac/perfis/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dados),
    });
    return json<Perfil>(res);
  },
  async apagarPerfil(id: string): Promise<void> {
    await apiFetch(`/admin/rbac/perfis/${id}`, { method: 'DELETE' });
  },
  async getUsuarios(): Promise<Usuario[]> {
    const res = await apiFetch('/admin/rbac/usuarios');
    return (await json<{ usuarios: Usuario[] }>(res)).usuarios;
  },
  async criarUsuario(nome: string, email: string): Promise<Usuario> {
    const res = await apiFetch('/admin/rbac/usuarios', {
      method: 'POST',
      body: JSON.stringify({ nome, email }),
    });
    return json<Usuario>(res);
  },
  async setPerfisDoUsuario(
    id: string,
    perfilIds: string[],
  ): Promise<{ id: string; nome: string }[]> {
    const res = await apiFetch(`/admin/rbac/usuarios/${id}/perfis`, {
      method: 'PUT',
      body: JSON.stringify({ perfilIds }),
    });
    return (await json<{ perfis: { id: string; nome: string }[] }>(res)).perfis;
  },
};

/** Extrai uma mensagem curta de um erro de `apiFetch` (400/409 trazem `message`). */
export function mensagemErro(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'não foi possível concluir a ação';
}
