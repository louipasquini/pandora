import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/** Helpers e2e da spec 015 (disparos). */
export function crmDisparosHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function criarUsuario(nome = 'Teste Disparos'): Promise<string> {
    const t = tag();
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome, email: `disp+${t}@x.com` });
    if (u.status !== 201) throw new Error(`criar usuario falhou ${u.status}: ${JSON.stringify(u.body)}`);
    return u.body.id as string;
  }

  /** Devolve `{ token, usuarioId }` de um `Usuario` com exatamente `perms`. */
  async function sujeitoCom(perms: string[]): Promise<{ token: string; usuarioId: string }> {
    const usuarioId = await criarUsuario();
    if (perms.length > 0) {
      const t = tag();
      const p = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: `perfil-${t}`, permissoes: perms });
      if (p.status !== 201) throw new Error(`criar perfil falhou ${p.status}: ${JSON.stringify(p.body)}`);
      const put = await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p.body.id] });
      if (put.status >= 300) throw new Error(`atribuir perfil falhou ${put.status}: ${JSON.stringify(put.body)}`);
    }
    return { token: issueUserToken(usuarioId), usuarioId };
  }

  async function criarCanal() {
    const t = tag();
    const res = await http()
      .post('/crm/admin/whatsapp/canais')
      .set(ADMIN)
      .send({
        nome: `Canal ${t}`,
        numeroTelefone: '+5511900000000',
        wabaId: `waba-${t}`,
        phoneNumberId: `phone-${t}`,
        accessToken: `access-token-${t}`,
        appSecret: `app-secret-${t}`,
        webhookVerifyToken: `verify-token-${t}`,
      });
    if (res.status !== 201) throw new Error(`criarCanal falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  async function criarTemplateAprovado(canalId: string, nomeMeta = `tpl_${tag()}`) {
    const res = await http().post(`/crm/admin/whatsapp/canais/${canalId}/templates/sincronizar`).set(ADMIN);
    if (res.status !== 200) throw new Error(`sincronizar falhou ${res.status}: ${JSON.stringify(res.body)}`);
    const t = res.body.templates.find((x: { nomeMeta: string }) => x.nomeMeta === nomeMeta);
    if (!t) throw new Error(`template ${nomeMeta} não sincronizado`);
    return t.id as string;
  }

  /**
   * `origem` única por chamada (default) — evita que um segmento com filtro
   * vazio pegue leads de OUTRAS suítes e2e no mesmo schema compartilhado
   * (jest roda os arquivos em série, `maxWorkers: 1`, mas o schema é o mesmo
   * processo a processo; leads de outra spec podem não ter sido limpos ainda
   * no momento exato em que esta suíte materializa um disparo).
   */
  async function criarLead(telefone: string, origem: string, nome = 'Lead Disparo') {
    const res = await http()
      .post('/crm/leads')
      .set(ADMIN)
      .send({ nome: `${nome} ${tag()}`, telefone, origem });
    if (res.status !== 201) throw new Error(`criarLead falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  async function criarSegmentoLead(origem: string) {
    const res = await http()
      .post('/crm/segmentos')
      .set(ADMIN)
      .send({ nome: `Segmento ${tag()}`, alvo: 'LEAD', filtro: { origem: [origem] } });
    if (res.status !== 201) throw new Error(`criarSegmento falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  let contadorTelefone = 0;
  function numeroUnico(): string {
    contadorTelefone += 1;
    return `+55119${String(contadorTelefone).padStart(8, '0')}`;
  }

  return {
    http,
    ADMIN,
    bearer: (t: string) => ({ Authorization: `Bearer ${t}` }),
    sujeitoCom,
    criarCanal,
    criarTemplateAprovado,
    criarLead,
    criarSegmentoLead,
    numeroUnico,
    origemUnica: () => `disparo-teste-${tag()}`,
  };
}
