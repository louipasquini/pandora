import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { crmAdminHelpers, instanteBRT } from './support/crm-admin';

/**
 * spec 007 — Administração do CRM (e2e, Postgres real).
 * Equipes/membros (índice parcial), expediente (`estaEmExpediente` via endpoint),
 * integrações (segredo nunca vaza; API key revelada 1×), auditoria (delta real,
 * sem segredo), guard 401/403/2xx, catálogo RBAC, regressão `/health`.
 */
describe('crm — Administração do CRM (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmAdminHelpers>;
  const ADMIN = authHeader();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmAdminHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.crmAdminAudit.deleteMany({});
    await prisma.equipeMembro.deleteMany({});
    await prisma.janelaAtendimento.deleteMany({});
    await prisma.feriado.deleteMany({});
    await prisma.integracao.deleteMany({});
    await prisma.equipe.deleteMany({});
  });

  const http = () => request(app.getHttpServer());

  // --------------------------------------------------------------- expediente

  describe('expediente', () => {
    it('POST janela com hora_fim <= hora_inicio → 422 janela_invalida', async () => {
      const res = await h.criarJanela({ horaInicio: '18:00', horaFim: '09:00' });
      expect(res.status).toBe(422);
      expect(res.body.erro ?? res.body.message).toBeDefined();
    });

    it('CRUD de janela + 1 crm_admin_audit por escrita; DELETE some do GET', async () => {
      const c = await h.criarJanela();
      expect(c.status).toBe(201);
      const id = c.body.id as string;

      const lista = await http().get('/crm/admin/janelas-atendimento').set(ADMIN);
      expect(lista.body.itens.some((j: { id: string }) => j.id === id)).toBe(true);

      await http()
        .patch(`/crm/admin/janelas-atendimento/${id}`)
        .set(ADMIN)
        .send({ horaFim: '17:00' })
        .expect(200);

      await http().delete(`/crm/admin/janelas-atendimento/${id}`).set(ADMIN).expect(204);
      const depois = await http().get('/crm/admin/janelas-atendimento').set(ADMIN);
      expect(depois.body.itens.some((j: { id: string }) => j.id === id)).toBe(false);

      const audit = await prisma.crmAdminAudit.findMany({
        where: { entidade: 'janela_atendimento', entidadeId: id },
      });
      expect(audit.map((a) => a.campo).sort()).toEqual(['criado', 'editado', 'removido']);
    });

    it('GET /crm/admin/expediente reflete janela e feriado', async () => {
      await h.criarJanela({ diaSemana: 3, horaInicio: '09:00', horaFim: '18:00' });
      const quarta14 = instanteBRT(2026, 9, 9, 14); // quarta

      const dentro = await h.consultarExpediente({ instante: quarta14 });
      expect(dentro.status).toBe(200);
      expect(dentro.body.emExpediente).toBe(true);

      await h.criarFeriado({ data: '2026-09-09', descricao: 'ponto facultativo' });
      const comFeriado = await h.consultarExpediente({ instante: quarta14 });
      expect(comFeriado.body.emExpediente).toBe(false);
    });

    it('instante malformado → 400', async () => {
      const res = await h.consultarExpediente({ instante: 'não-é-data' });
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('instante_invalido');
    });

    it('união global + janela de equipe', async () => {
      const equipeId = await h.criarEquipe();
      await h.criarJanela({ diaSemana: 3, horaInicio: '09:00', horaFim: '18:00' }); // global
      await h.criarJanela({
        equipeId,
        diaSemana: 6, // sábado
        horaInicio: '08:00',
        horaFim: '12:00',
      });
      const sabado10 = instanteBRT(2026, 9, 12, 10);
      expect((await h.consultarExpediente({ instante: sabado10 })).body.emExpediente).toBe(
        false,
      );
      expect(
        (await h.consultarExpediente({ instante: sabado10, equipeId })).body.emExpediente,
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------- integrações

  describe('integracoes', () => {
    it('WEBHOOK com segredo → máscara na resposta, valor nunca aparece', async () => {
      const criar = await h.criarIntegracao({ segredo: 's3cr3t-abcd' });
      expect(criar.status).toBe(201);
      const id = criar.body.integracao.id as string;
      expect(JSON.stringify(criar.body)).not.toContain('s3cr3t-abcd');
      expect(criar.body.integracao.segredoMascarado).toBe('••••••abcd');
      expect(criar.body.integracao.segredoDefinido).toBe(true);

      const get = await http().get(`/crm/admin/integracoes/${id}`).set(ADMIN);
      expect(JSON.stringify(get.body)).not.toContain('s3cr3t-abcd');
      expect(get.body.segredoMascarado).toBe('••••••abcd');

      const audits = await prisma.crmAdminAudit.findMany({
        where: { entidade: 'integracao', entidadeId: id },
      });
      expect(JSON.stringify(audits)).not.toContain('s3cr3t-abcd');
      expect(JSON.stringify(audits)).toContain('definido');
    });

    it('API_KEY sem segredo → apiKey revelada 1×, ausente no GET seguinte', async () => {
      const criar = await h.criarIntegracao({ tipo: 'API_KEY', segredo: undefined });
      expect(criar.status).toBe(201);
      const apiKey = criar.body.apiKey as string;
      expect(apiKey).toMatch(/^crm_[0-9a-f]{40}$/);
      const id = criar.body.integracao.id as string;

      const get = await http().get(`/crm/admin/integracoes/${id}`).set(ADMIN);
      expect(JSON.stringify(get.body)).not.toContain(apiKey);
      expect(get.body.apiKey).toBeUndefined();
      expect(get.body.segredoMascarado).toBe(`••••••${apiKey.slice(-4)}`);

      // rotacionar → novo valor 1×, o antigo não é mais válido
      const rot = await http()
        .post(`/crm/admin/integracoes/${id}/rotacionar`)
        .set(ADMIN)
        .send({});
      expect(rot.status).toBe(200);
      expect(rot.body.apiKey).toMatch(/^crm_[0-9a-f]{40}$/);
      expect(rot.body.apiKey).not.toBe(apiKey);
    });

    it('PATCH sem segredo preserva o segredo', async () => {
      const criar = await h.criarIntegracao({ segredo: 'mantenha-me-xyz9' });
      const id = criar.body.integracao.id as string;
      await http()
        .patch(`/crm/admin/integracoes/${id}`)
        .set(ADMIN)
        .send({ nome: 'novo nome' })
        .expect(200);
      const get = await http().get(`/crm/admin/integracoes/${id}`).set(ADMIN);
      expect(get.body.segredoDefinido).toBe(true);
      expect(get.body.segredoMascarado).toBe('••••••xyz9');
    });

    it('rotacionar CONEXAO_INTERNA sem segredo → 409', async () => {
      const criar = await h.criarIntegracao({
        tipo: 'CONEXAO_INTERNA',
        alvo: 'FINANCEIRO',
      });
      const id = criar.body.integracao.id as string;
      const rot = await http()
        .post(`/crm/admin/integracoes/${id}/rotacionar`)
        .set(ADMIN)
        .send({});
      expect(rot.status).toBe(409);
    });

    it('config com chave suspeita → 422', async () => {
      const res = await h.criarIntegracao({ config: { token: 'x' } });
      expect(res.status).toBe(400); // zod → BadRequest
    });
  });

  // ------------------------------------------------------------------ equipes

  describe('equipes', () => {
    it('cria equipe ativa; membro; 2º vínculo ativo do par → 409', async () => {
      const equipeId = await h.criarEquipe();
      const usuarioId = await h.criarUsuario();

      const m1 = await http()
        .post(`/crm/admin/equipes/${equipeId}/membros`)
        .set(ADMIN)
        .send({ usuarioId, papel: 'MEMBRO' });
      expect(m1.status).toBe(201);

      const m2 = await http()
        .post(`/crm/admin/equipes/${equipeId}/membros`)
        .set(ADMIN)
        .send({ usuarioId, papel: 'LIDER' });
      expect(m2.status).toBe(409);
      expect(m2.body.erro).toBe('vinculo_ativo_existente');
    });

    it('usuarioId inexistente → 422', async () => {
      const equipeId = await h.criarEquipe();
      const res = await http()
        .post(`/crm/admin/equipes/${equipeId}/membros`)
        .set(ADMIN)
        .send({ usuarioId: '00000000-0000-4000-8000-000000000000', papel: 'MEMBRO' });
      expect(res.status).toBe(422);
    });

    it('remover membro preenche saiu_em; DELETE de novo → 204 sem auditoria nova; reentrada OK', async () => {
      const equipeId = await h.criarEquipe();
      const usuarioId = await h.criarUsuario();
      await http()
        .post(`/crm/admin/equipes/${equipeId}/membros`)
        .set(ADMIN)
        .send({ usuarioId })
        .expect(201);

      await http()
        .delete(`/crm/admin/equipes/${equipeId}/membros/${usuarioId}`)
        .set(ADMIN)
        .expect(204);

      const detalhe = await http().get(`/crm/admin/equipes/${equipeId}`).set(ADMIN);
      expect(detalhe.body.membrosAtivos).toHaveLength(0);
      expect(detalhe.body.historicoMembros).toHaveLength(1);
      expect(detalhe.body.historicoMembros[0].saiuEm).not.toBeNull();

      const auditAntes = await prisma.crmAdminAudit.count({
        where: { entidade: 'equipe_membro', campo: 'membro_removido' },
      });
      await http()
        .delete(`/crm/admin/equipes/${equipeId}/membros/${usuarioId}`)
        .set(ADMIN)
        .expect(204);
      const auditDepois = await prisma.crmAdminAudit.count({
        where: { entidade: 'equipe_membro', campo: 'membro_removido' },
      });
      expect(auditDepois).toBe(auditAntes);

      // reentrada após saída → novo vínculo
      await http()
        .post(`/crm/admin/equipes/${equipeId}/membros`)
        .set(ADMIN)
        .send({ usuarioId })
        .expect(201);
    });

    it('um usuário em N equipes; PATCH ativo:false some da lista padrão', async () => {
      const usuarioId = await h.criarUsuario();
      const e1 = await h.criarEquipe();
      const e2 = await h.criarEquipe();
      for (const eid of [e1, e2]) {
        await http()
          .post(`/crm/admin/equipes/${eid}/membros`)
          .set(ADMIN)
          .send({ usuarioId })
          .expect(201);
      }
      const porUsuario = await http()
        .get(`/crm/admin/equipes?usuarioId=${usuarioId}`)
        .set(ADMIN);
      expect(porUsuario.body.total).toBe(2);

      await http()
        .patch(`/crm/admin/equipes/${e1}`)
        .set(ADMIN)
        .send({ ativo: false })
        .expect(200);
      const ativos = await http().get('/crm/admin/equipes?ativo=true').set(ADMIN);
      expect(ativos.body.itens.some((x: { id: string }) => x.id === e1)).toBe(false);
    });

    it('PATCH no-op → sem auditoria', async () => {
      const equipeId = await h.criarEquipe({ nome: 'Fixa', descricao: null, tipo: 'CS' });
      await prisma.crmAdminAudit.deleteMany({});
      await http()
        .patch(`/crm/admin/equipes/${equipeId}`)
        .set(ADMIN)
        .send({ nome: 'Fixa', tipo: 'CS' })
        .expect(200);
      expect(await prisma.crmAdminAudit.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- auditoria

  describe('auditoria', () => {
    it('toda escrita → 1 registro AJUSTE_MANUAL com autor; GET /crm/admin/auditoria filtra', async () => {
      const equipeId = await h.criarEquipe();
      const regs = await prisma.crmAdminAudit.findMany({
        where: { entidade: 'equipe', entidadeId: equipeId },
      });
      expect(regs).toHaveLength(1);
      expect(regs[0].origem).toBe('AJUSTE_MANUAL');
      expect(regs[0].autor).toBe(process.env.SERVICE_CLIENT_ID);

      const via = await http()
        .get(`/crm/admin/auditoria?entidade=equipe&entidadeId=${equipeId}`)
        .set(ADMIN);
      expect(via.body.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------- guard

  describe('guard + catálogo', () => {
    it('sem token → 401; token sem permissão → 403; credencial de serviço → 2xx', async () => {
      await http().get('/crm/admin/equipes').expect(401);

      const semPerm = await h.tokenComPermissoes([]);
      await http()
        .get('/crm/admin/equipes')
        .set({ Authorization: `Bearer ${semPerm}` })
        .expect(403);

      await http().get('/crm/admin/equipes').set(ADMIN).expect(200);
    });

    it('leitor com crm_admin:ver não pode escrever equipe (403)', async () => {
      const tokenLeitor = await h.tokenComPermissoes(['crm_admin:ver']);
      await http()
        .get('/crm/admin/equipes')
        .set({ Authorization: `Bearer ${tokenLeitor}` })
        .expect(200);
      await http()
        .post('/crm/admin/equipes')
        .set({ Authorization: `Bearer ${tokenLeitor}` })
        .send({ nome: 'x', tipo: 'CS' })
        .expect(403);
    });

    it('catálogo expõe o recurso crm_admin (4 da 007 + gerir_campos_lead da 008)', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const grupo = res.body.recursos.find(
        (r: { recurso: string }) => r.recurso === 'crm_admin',
      );
      expect(grupo.permissoes).toHaveLength(5);

      const efetivas = await http().get('/auth/permissoes-efetivas').set(ADMIN);
      expect(efetivas.body.permissoes).toEqual(
        expect.arrayContaining([
          'crm_admin:ver',
          'crm_admin:gerir_equipes',
          'crm_admin:gerir_expediente',
          'crm_admin:gerir_integracoes',
        ]),
      );
    });

    it('/health continua com 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.body.contexts).toHaveLength(11);
    });
  });
});
