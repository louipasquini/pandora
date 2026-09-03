import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/**
 * Helpers e2e da spec 005. Constroem `pessoa`/`conta` pela API e emitem tokens de
 * `Usuario` com um recorte de permissões (via os endpoints RBAC da 004).
 */
export function clientesHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  // ids de RBAC criados por esta suíte — para o afterEach limpar SÓ os próprios
  // (a suíte e2e da 004 roda em paralelo no mesmo schema; um `deleteMany({})`
  // global aqui apagaria as linhas dela no meio dos testes).
  const rbacCriados: { usuarios: string[]; perfis: string[] } = {
    usuarios: [],
    perfis: [],
  };

  async function criarPessoa(body: Record<string, unknown>): Promise<string> {
    const res = await http().post('/pessoas').set(ADMIN).send(body);
    if (res.status !== 201) {
      throw new Error(`criarPessoa falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function criarConta(
    tipo: 'HOUSEHOLD' | 'EMPRESA',
    nome: string,
  ): Promise<string> {
    const res = await http().post('/contas').set(ADMIN).send({ tipo, nome });
    if (res.status !== 201) {
      throw new Error(`criarConta falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  /** Cria um `Usuario` + `Perfil` com as permissões dadas; devolve o token dele. */
  async function tokenComPermissoes(perms: string[]): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome: 'Teste', email: `u+${tag}@x.com` });
    if (u.status !== 201) {
      throw new Error(`criar usuario falhou ${u.status}: ${JSON.stringify(u.body)}`);
    }
    const usuarioId = u.body.id as string;
    rbacCriados.usuarios.push(usuarioId);
    if (perms.length > 0) {
      const p = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: `perfil-${tag}`, permissoes: perms });
      if (p.status !== 201) {
        throw new Error(`criar perfil falhou ${p.status}: ${JSON.stringify(p.body)}`);
      }
      rbacCriados.perfis.push(p.body.id as string);
      const put = await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p.body.id] });
      if (put.status >= 400) {
        throw new Error(`atribuir perfil falhou ${put.status}: ${JSON.stringify(put.body)}`);
      }
    }
    return issueUserToken(usuarioId);
  }

  return {
    http,
    ADMIN,
    criarPessoa,
    criarConta,
    tokenComPermissoes,
    /** ids RBAC criados por esta suíte (drenar no afterEach — ver comentário acima). */
    rbacCriados,
  };
}

// CPFs/CNPJ válidos para fixtures de dedup
export const CPF_VALIDO_1 = '52998224725';
export const CPF_VALIDO_2 = '11144477735';
export const CPF_VALIDO_3 = '12345678909';
export const CNPJ_VALIDO = '11222333000181';
