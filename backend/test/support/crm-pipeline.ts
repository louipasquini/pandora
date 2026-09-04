import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/**
 * Helpers e2e da spec 010 (pipeline/oportunidade). Constroem pipeline/etapa/
 * oportunidade/equipe pela API e emitem tokens de `Usuario` com um recorte de
 * permissões (via os endpoints RBAC da 004).
 */
export function crmPipelineHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  const rbacCriados: { usuarios: string[]; perfis: string[] } = {
    usuarios: [],
    perfis: [],
  };

  async function criarUsuario(nome = 'Teste Pipeline'): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome, email: `pip+${tag}@x.com` });
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

  async function criarPessoa(nome = 'Pessoa Pipeline'): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await http()
      .post('/pessoas')
      .set(ADMIN)
      .send({ nome, emails: [`p+${tag}@x.com`] });
    if (res.status !== 201) {
      throw new Error(`criarPessoa falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function criarLead(body: Record<string, unknown> = {}): Promise<string> {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await http()
      .post('/crm/leads')
      .set(ADMIN)
      .send({ nome: `Lead ${tag}`, email: `l+${tag}@x.com`, ...body });
    if (res.status !== 201) {
      throw new Error(`criarLead falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function criarEquipe(over: Record<string, unknown> = {}): Promise<string> {
    const res = await http()
      .post('/crm/admin/equipes')
      .set(ADMIN)
      .send({ nome: `Equipe ${Math.random().toString(36).slice(2, 7)}`, tipo: 'COMERCIAL', ...over });
    if (res.status !== 201) {
      throw new Error(`criarEquipe falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function adicionarMembro(equipeId: string, usuarioId: string, papel = 'MEMBRO') {
    const res = await http()
      .post(`/crm/admin/equipes/${equipeId}/membros`)
      .set(ADMIN)
      .send({ usuarioId, papel });
    if (res.status !== 201) {
      throw new Error(`adicionarMembro falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  /** Pipeline com 1 etapa ABERTA, 1 GANHA, 1 PERDIDA — pronto para receber oportunidade. */
  async function criarPipelineCompleto(
    over: Record<string, unknown> = {},
  ): Promise<{ pipelineId: string; aberta: string; ganha: string; perdida: string }> {
    const p = await http()
      .post('/crm/pipelines')
      .set(ADMIN)
      .send({ nome: `Pipeline ${Math.random().toString(36).slice(2, 7)}`, ...over });
    if (p.status !== 201) {
      throw new Error(`criarPipeline falhou ${p.status}: ${JSON.stringify(p.body)}`);
    }
    const pipelineId = p.body.id as string;

    const etapa = (nome: string, ordem: number, tipo: string, slaHoras?: number) =>
      http()
        .post(`/crm/pipelines/${pipelineId}/etapas`)
        .set(ADMIN)
        .send({ nome, ordem, tipo, ...(slaHoras ? { slaHoras } : {}) });

    const aberta = await etapa('Novo contato', 0, 'ABERTA');
    const ganha = await etapa('Ganho', 1, 'GANHA');
    const perdida = await etapa('Perdido', 2, 'PERDIDA');
    for (const r of [aberta, ganha, perdida]) {
      if (r.status !== 201) throw new Error(`criarEtapa falhou ${r.status}: ${JSON.stringify(r.body)}`);
    }
    return {
      pipelineId,
      aberta: aberta.body.id as string,
      ganha: ganha.body.id as string,
      perdida: perdida.body.id as string,
    };
  }

  async function criarOportunidade(
    pipelineId: string,
    ancora: { pessoaId?: string; leadId?: string },
    body: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/crm/oportunidades')
      .set(ADMIN)
      .send({
        pipelineId,
        titulo: 'Oportunidade teste',
        valorEstimado: { valorInt: '500000000', moeda: 'BRL' },
        ...ancora,
        ...body,
      });
    return { status: res.status, body: res.body };
  }

  return {
    ADMIN,
    http,
    criarUsuario,
    sujeitoCom,
    criarPessoa,
    criarLead,
    criarEquipe,
    adicionarMembro,
    criarPipelineCompleto,
    criarOportunidade,
    rbacCriados,
  };
}
