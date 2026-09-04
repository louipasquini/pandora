import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { crmLeadHelpers } from './support/crm-lead';
import { RegistrarLeadService } from '../src/crm/application/lead/registrar-lead.service';

/**
 * spec 008 — Lead do CRM (e2e, Postgres real).
 * CRUD + auditoria (delta/no-op), escopo de visão `ver_proprios` (sem vazamento),
 * scoring idempotente, conversão reusando a engine da 005 (idempotente, sem
 * import de `clientes`), campos personalizados (validação por tipo), guard
 * 401/403/2xx, catálogo +1, porta `RegistrarLeadService`, regressão `/health`.
 */
describe('crm — Lead (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmLeadHelpers>;
  const ADMIN = authHeader();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmLeadHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.crmLeadAudit.deleteMany({});
    await prisma.valorCampoLead.deleteMany({});
    await prisma.campoPersonalizadoLead.deleteMany({});
    await prisma.lead.deleteMany({});
  });

  const http = () => request(app.getHttpServer());

  // ------------------------------------------------------------------ US1: CRUD

  describe('US1 — CRUD + auditoria', () => {
    it('POST cria NOVO/ATIVO + score + 1 audit; sem contato → 422', async () => {
      const c = await h.criarLead({ origem: 'formulario_lp' });
      expect(c.status).toBe(201);
      expect(c.body.estagio).toBe('NOVO');
      expect(c.body.status).toBe('ATIVO');
      expect(typeof c.body.score).toBe('number');
      expect(c.body.score).toBeGreaterThan(0);

      const aud = await h.auditoriaDe(c.body.id as string);
      expect(aud.filter((a) => a.motivo === 'criar')).toHaveLength(1);

      const semContato = await http()
        .post('/crm/leads')
        .set(ADMIN)
        .send({ nome: 'Sem contato' });
      expect(semContato.status).toBe(422);
    });

    it('e-mail já usado por lead ATIVO → cria + leadsSemelhantes', async () => {
      const a = await h.criarLead({ email: 'dup@x.com' });
      const b = await h.criarLead({ email: 'dup@x.com' });
      expect(b.status).toBe(201);
      expect(b.body.leadsSemelhantes).toContain(a.body.id);
    });

    it('PATCH estágio+responsável → score recalculado + 1 audit; no-op → 0 audit', async () => {
      const { usuarioId } = await h.sujeitoCom([]);
      const c = await h.criarLead({ email: 'p@x.com' });
      const id = c.body.id as string;

      const patch = await http()
        .patch(`/crm/leads/${id}`)
        .set(ADMIN)
        .send({ estagio: 'QUALIFICADO', responsavelId: usuarioId });
      expect(patch.status).toBe(200);
      expect(patch.body.estagio).toBe('QUALIFICADO');

      const aud1 = await h.auditoriaDe(id);
      expect(aud1.some((a) => a.motivo === 'editar')).toBe(true);
      expect(aud1.some((a) => a.motivo === 'recalculo')).toBe(true);

      const antes = (await h.auditoriaDe(id)).length;
      await http()
        .patch(`/crm/leads/${id}`)
        .set(ADMIN)
        .send({ estagio: 'QUALIFICADO' })
        .expect(200);
      expect((await h.auditoriaDe(id)).length).toBe(antes);
    });

    it('PATCH { score } → 400 (campo de sistema); responsavelId inexistente → 422', async () => {
      const c = await h.criarLead();
      const id = c.body.id as string;
      await http().patch(`/crm/leads/${id}`).set(ADMIN).send({ score: 99 }).expect(400);
      const r = await http()
        .patch(`/crm/leads/${id}`)
        .set(ADMIN)
        .send({ responsavelId: '00000000-0000-0000-0000-000000000000' });
      expect(r.status).toBe(422);
    });

    it('tags normalizadas, sem duplicar; vazia → 422', async () => {
      const c = await h.criarLead();
      const id = c.body.id as string;
      const t1 = await http().post(`/crm/leads/${id}/tags`).set(ADMIN).send({ tag: '  Webinar Out ' });
      expect(t1.body.tags).toContain('webinar-out');
      const t2 = await http().post(`/crm/leads/${id}/tags`).set(ADMIN).send({ tag: 'webinar out' });
      expect(t2.body.tags.filter((x: string) => x === 'webinar-out')).toHaveLength(1);
      await http().post(`/crm/leads/${id}/tags`).set(ADMIN).send({ tag: '  ' }).expect(422);
    });
  });

  // -------------------------------------------------- US2: escopo de visão

  describe('US2 — escopo de visão', () => {
    it('ver_proprios só enxerga os próprios; ver_todos enxerga tudo; sem perm → 403', async () => {
      const u = await h.sujeitoCom(['lead:ver_proprios', 'lead:criar', 'lead:editar']);
      const outro = await h.sujeitoCom([]);

      const meu = await h.criarLead({ email: 'meu@x.com', responsavelId: u.usuarioId });
      const alheio = await h.criarLead({ email: 'dele@x.com', responsavelId: outro.usuarioId });
      const semDono = await h.criarLead({ email: 'fila@x.com' });

      const lista = await http().get('/crm/leads').set(bearer(u.token));
      expect(lista.status).toBe(200);
      const ids = (lista.body.itens as { id: string }[]).map((x) => x.id);
      expect(ids).toContain(meu.body.id);
      expect(ids).not.toContain(alheio.body.id);
      expect(ids).not.toContain(semDono.body.id);

      // detalhe de lead alheio → 404
      await http().get(`/crm/leads/${alheio.body.id}`).set(bearer(u.token)).expect(404);
      // filtro não amplia o escopo
      const filtrado = await http()
        .get(`/crm/leads?responsavelId=${outro.usuarioId}`)
        .set(bearer(u.token));
      expect(filtrado.body.itens).toHaveLength(0);

      // ver_todos
      const todos = await h.sujeitoCom(['lead:ver_todos']);
      const listaTodos = await http().get('/crm/leads').set(bearer(todos.token));
      const idsTodos = (listaTodos.body.itens as { id: string }[]).map((x) => x.id);
      expect(idsTodos).toEqual(
        expect.arrayContaining([meu.body.id, alheio.body.id, semDono.body.id]),
      );

      // sem nenhuma das duas → 403
      const nada = await h.sujeitoCom([]);
      await http().get('/crm/leads').set(bearer(nada.token)).expect(403);
      await http().get(`/crm/leads/${meu.body.id}`).set(bearer(nada.token)).expect(403);
    });

    it('sem token → 401', async () => {
      await http().get('/crm/leads').expect(401);
    });
  });

  // ---------------------------------------------------------- US3: scoring

  describe('US3 — scoring derivado e idempotente', () => {
    it('recalcular 5× → score estável; lote 2× → 0 diff na 2ª', async () => {
      const c = await h.criarLead({ email: 'sc@x.com' });
      const id = c.body.id as string;
      const s0 = c.body.score as number;
      for (let i = 0; i < 5; i++) {
        const r = await http().post(`/crm/leads/${id}/recalcular-score`).set(ADMIN);
        expect(r.status).toBe(200);
        expect(r.body.score).toBe(s0);
      }
      const l1 = await http().post('/crm/leads/recalcular-score').set(ADMIN).send({});
      const l2 = await http().post('/crm/leads/recalcular-score').set(ADMIN).send({});
      expect(l2.body.alterados).toBe(0);
      expect(l1.body.processados).toBeGreaterThanOrEqual(1);
    });

    it('completar contato aumenta o score e audita como recalculo', async () => {
      const c = await http()
        .post('/crm/leads')
        .set(ADMIN)
        .send({ nome: 'So telefone', telefone: '11988887777' });
      const id = c.body.id as string;
      const antes = c.body.score as number;
      const p = await http()
        .patch(`/crm/leads/${id}`)
        .set(ADMIN)
        .send({ email: 'agora@x.com' });
      expect(p.body.score).toBeGreaterThan(antes);
      const aud = await h.auditoriaDe(id);
      expect(aud.some((a) => a.motivo === 'recalculo' && a.campo === 'score')).toBe(true);
    });
  });

  // ------------------------------------------------------- US4: conversão

  describe('US4 — conversão Lead → Pessoa (engine da 005)', () => {
    async function criarPessoaComEmail(email: string): Promise<string> {
      const r = await http().post('/pessoas').set(ADMIN).send({ nome: 'P', emails: [email] });
      expect(r.status).toBe(201);
      return r.body.id as string;
    }

    it('e-mail casa pessoa existente → vincula; e-mail novo → cria; idempotente', async () => {
      const pid = await criarPessoaComEmail('casa@x.com');
      const l1 = await h.criarLead({ email: 'casa@x.com' });
      const conv1 = await http().post(`/crm/leads/${l1.body.id}/converter`).set(ADMIN);
      expect(conv1.status).toBe(200);
      expect(conv1.body.pessoaId).toBe(pid);
      expect(conv1.body.criouPessoa).toBe(false);
      expect(conv1.body.status).toBe('CONVERTIDO');

      // idempotente
      const antesAud = (await h.auditoriaDe(l1.body.id as string)).length;
      const conv1b = await http().post(`/crm/leads/${l1.body.id}/converter`).set(ADMIN);
      expect(conv1b.body.pessoaId).toBe(pid);
      expect((await h.auditoriaDe(l1.body.id as string)).length).toBe(antesAud);

      const l2 = await h.criarLead({ email: 'nova-pessoa@x.com' });
      const conv2 = await http().post(`/crm/leads/${l2.body.id}/converter`).set(ADMIN);
      expect(conv2.body.criouPessoa).toBe(true);
      expect(conv2.body.pessoaId).toBeTruthy();

      // audit da conversão
      const aud = await h.auditoriaDe(l1.body.id as string);
      expect(aud.some((a) => a.motivo === 'converter')).toBe(true);
    });

    it('sem pessoa:editar → 403; lead DESCARTADO → 409', async () => {
      const semPessoa = await h.sujeitoCom(['lead:editar', 'lead:ver_todos']);
      const l = await h.criarLead({ email: 'p403@x.com' });
      await http().post(`/crm/leads/${l.body.id}/converter`).set(bearer(semPessoa.token)).expect(403);

      const d = await h.criarLead({ email: 'desc@x.com' });
      await http().patch(`/crm/leads/${d.body.id}`).set(ADMIN).send({ status: 'DESCARTADO' });
      await http().post(`/crm/leads/${d.body.id}/converter`).set(ADMIN).expect(409);
    });

    it('nenhum arquivo de src/crm/ importa src/clientes/', () => {
      const dir = join(__dirname, '../src/crm');
      const files: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith('.ts')) files.push(p);
        }
      };
      walk(dir);
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        const semComentarios = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(semComentarios).not.toMatch(/from ['"][^'"]*clientes/);
        expect(semComentarios).not.toMatch(/require\(['"][^'"]*clientes/);
      }
    });
  });

  // ----------------------------------------------- US5: campos personalizados

  describe('US5 — campos personalizados (esquema administrável)', () => {
    const criarDef = (body: Record<string, unknown>) =>
      http().post('/crm/admin/campos-lead').set(ADMIN).send(body);

    it('SELECAO sem opcoes → 422; chave repetida → 409', async () => {
      expect((await criarDef({ chave: 'nicho', rotulo: 'Nicho', tipo: 'SELECAO' })).status).toBe(422);
      const ok = await criarDef({
        chave: 'nicho',
        rotulo: 'Nicho',
        tipo: 'SELECAO',
        opcoes: ['clinica', 'esportiva'],
      });
      expect(ok.status).toBe(201);
      expect((await criarDef({ chave: 'nicho', rotulo: 'X', tipo: 'TEXTO' })).status).toBe(409);
    });

    it('PUT valores: desconhecido/tipo/obrigatório → 422; substituição total; delta auditado', async () => {
      await criarDef({ chave: 'idade_lista', rotulo: 'Tamanho lista', tipo: 'NUMERO' });
      const obr = await criarDef({
        chave: 'consentiu',
        rotulo: 'Consentiu?',
        tipo: 'BOOLEANO',
        obrigatorio: true,
      });
      expect(obr.status).toBe(201);

      const l = await h.criarLead({ email: 'cp@x.com' });
      const id = l.body.id as string;
      const url = `/crm/leads/${id}/campos-personalizados`;

      await http().put(url).set(ADMIN).send({ inexistente: 'x', consentiu: true }).expect(422);
      await http().put(url).set(ADMIN).send({ idade_lista: 'abc', consentiu: true }).expect(422);
      await http().put(url).set(ADMIN).send({ idade_lista: '5000' }).expect(422); // falta obrigatório

      const ok = await http()
        .put(url)
        .set(ADMIN)
        .send({ idade_lista: '5000', consentiu: true });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ idade_lista: '5000', consentiu: 'true' });

      // substituição total: omitir idade_lista remove
      const ok2 = await http().put(url).set(ADMIN).send({ consentiu: false });
      expect(ok2.body.idade_lista).toBeUndefined();
      expect(ok2.body.consentiu).toBe('false');

      const aud = await h.auditoriaDe(id);
      expect(aud.some((a) => a.motivo === 'campos_personalizados')).toBe(true);
    });

    it('DELETE de definição em uso → 409', async () => {
      const d = await criarDef({ chave: 'obs', rotulo: 'Obs', tipo: 'TEXTO' });
      const l = await h.criarLead({ email: 'du@x.com' });
      await http()
        .put(`/crm/leads/${l.body.id}/campos-personalizados`)
        .set(ADMIN)
        .send({ obs: 'nota' })
        .expect(200);
      await http().delete(`/crm/admin/campos-lead/${d.body.id}`).set(ADMIN).expect(409);
    });
  });

  // ------------------------------------- US6 + catálogo + porta + regressão

  describe('catálogo, porta e regressão', () => {
    it('catálogo expõe crm_admin:gerir_campos_lead; lead:* intactas', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const crmAdmin = res.body.recursos.find((r: { recurso: string }) => r.recurso === 'crm_admin');
      expect(crmAdmin.permissoes.map((p: { id: string }) => p.id)).toContain(
        'crm_admin:gerir_campos_lead',
      );
      const lead = res.body.recursos.find((r: { recurso: string }) => r.recurso === 'lead');
      expect(lead.permissoes.map((p: { id: string }) => p.id)).toEqual([
        'lead:criar',
        'lead:editar',
        'lead:ver_todos',
        'lead:ver_proprios',
      ]);
      const efetivas = await http().get('/auth/permissoes-efetivas').set(ADMIN);
      expect(efetivas.body.permissoes).toContain('crm_admin:gerir_campos_lead');
    });

    it('RegistrarLeadService é idempotente por (origem, id_externo)', async () => {
      const svc = app.get(RegistrarLeadService);
      const chave = { origem: 'marketing:meta', idExterno: `x-${Date.now()}` };
      const a = await svc.registrar({ nome: 'Lead MKT', email: 'mkt@x.com' }, chave);
      expect(a.criado).toBe(true);
      const b = await svc.registrar({ nome: 'Lead MKT', email: 'mkt@x.com' }, chave);
      expect(b.criado).toBe(false);
      expect(b.leadId).toBe(a.leadId);
    });

    it('/health segue com 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.body.contexts).toHaveLength(11);
    });
  });
});
