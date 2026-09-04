import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/**
 * Helpers e2e da spec 008 (Lead do CRM). Criam leads / definições de campo pela
 * API e emitem tokens de `Usuario` com um recorte de permissões (endpoints RBAC
 * da 004).
 */
export function crmLeadHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  const rbacCriados: { usuarios: string[]; perfis: string[] } = {
    usuarios: [],
    perfis: [],
  };

  async function criarUsuario(nome = 'Teste Lead'): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome, email: `lead+${tag}@x.com` });
    if (u.status !== 201) {
      throw new Error(`criar usuario falhou ${u.status}: ${JSON.stringify(u.body)}`);
    }
    rbacCriados.usuarios.push(u.body.id as string);
    return u.body.id as string;
  }

  /** Devolve `{ token, usuarioId }` de um `Usuario` com exatamente `perms`. */
  async function sujeitoCom(perms: string[]): Promise<{ token: string; usuarioId: string }> {
    const usuarioId = await criarUsuario();
    if (perms.length > 0) {
      const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      if (put.status >= 300) throw new Error(`atribuir perfil falhou ${put.status}`);
    }
    return { token: issueUserToken(usuarioId), usuarioId };
  }

  async function criarLead(
    body: Record<string, unknown> = {},
    token?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const tag = Math.random().toString(36).slice(2);
    const res = await http()
      .post('/crm/leads')
      .set(token ? { Authorization: `Bearer ${token}` } : ADMIN)
      .send({ nome: `Lead ${tag}`, email: `l+${tag}@x.com`, ...body });
    return { status: res.status, body: res.body };
  }

  async function auditoriaDe(leadId: string): Promise<Record<string, unknown>[]> {
    const res = await http().get(`/crm/leads/${leadId}/auditoria`).set(ADMIN);
    return (res.body.itens ?? []) as Record<string, unknown>[];
  }

  return { ADMIN, http, criarUsuario, sujeitoCom, criarLead, auditoriaDe, rbacCriados };
}
