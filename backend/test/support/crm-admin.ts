import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/**
 * Helpers e2e da spec 007 (Administração do CRM). Constroem equipes / janelas /
 * feriados / integrações pela API e emitem tokens de `Usuario` com um recorte de
 * permissões (via os endpoints RBAC da 004).
 */
export function crmAdminHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  const rbacCriados: { usuarios: string[]; perfis: string[] } = {
    usuarios: [],
    perfis: [],
  };

  async function criarUsuario(): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome: 'Teste CRM', email: `crm+${tag}@x.com` });
    if (u.status !== 201) {
      throw new Error(`criar usuario falhou ${u.status}: ${JSON.stringify(u.body)}`);
    }
    rbacCriados.usuarios.push(u.body.id as string);
    return u.body.id as string;
  }

  async function tokenComPermissoes(perms: string[]): Promise<string> {
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
      if (put.status >= 300) {
        throw new Error(`atribuir perfil falhou ${put.status}`);
      }
    }
    return issueUserToken(usuarioId);
  }

  async function criarEquipe(
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await http()
      .post('/crm/admin/equipes')
      .set(ADMIN)
      .send({ nome: `Equipe ${Math.random().toString(36).slice(2, 7)}`, tipo: 'COMERCIAL', ...over });
    if (res.status !== 201) {
      throw new Error(`criarEquipe falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function criarJanela(over: Record<string, unknown> = {}) {
    return http()
      .post('/crm/admin/janelas-atendimento')
      .set(ADMIN)
      .send({ equipeId: null, diaSemana: 3, horaInicio: '09:00', horaFim: '18:00', ...over });
  }

  async function criarFeriado(over: Record<string, unknown> = {}) {
    return http()
      .post('/crm/admin/feriados')
      .set(ADMIN)
      .send({
        equipeId: null,
        data: '2026-10-14',
        descricao: 'Feriado teste',
        recorrenteAnual: false,
        ...over,
      });
  }

  async function criarIntegracao(over: Record<string, unknown> = {}) {
    return http()
      .post('/crm/admin/integracoes')
      .set(ADMIN)
      .send({
        nome: `Integ ${Math.random().toString(36).slice(2, 7)}`,
        tipo: 'WEBHOOK',
        alvo: 'EXTERNO',
        config: {},
        ...over,
      });
  }

  async function consultarExpediente(q: { instante?: string; equipeId?: string } = {}) {
    const qs = new URLSearchParams();
    if (q.instante) qs.set('instante', q.instante);
    if (q.equipeId) qs.set('equipeId', q.equipeId);
    return http().get(`/crm/admin/expediente?${qs.toString()}`).set(ADMIN);
  }

  return {
    http,
    ADMIN,
    rbacCriados,
    criarUsuario,
    tokenComPermissoes,
    criarEquipe,
    criarJanela,
    criarFeriado,
    criarIntegracao,
    consultarExpediente,
  };
}

/** UTC ISO de um horário local America/Sao_Paulo (UTC-3, sem DST). */
export function instanteBRT(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto = 0,
): string {
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3, minuto)).toISOString();
}
