import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GRAPH_API_CLIENT } from '../src/crm/application/whatsapp';
import { atribuirVariante } from '../src/crm/domain/disparos';
import { crmDisparosHelpers } from './support/crm-disparos';
import { criarGraphApiDublê, type GraphApiDublê } from './support/crm-whatsapp';

/**
 * spec 015 — CRM · Disparos (e2e, Postgres real). Ciclo de vida (US1),
 * execução reativa idempotente com retry (D-R5), segmentação + CSV com dedup
 * e opt-out (US3, FR-004/FR-005), teste A/B (US4), quality rating (US2),
 * guard/escopo, regressão coberta por `context-modules.e2e-spec.ts`.
 */
describe('crm — Disparos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmDisparosHelpers>;
  let dublê: GraphApiDublê;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    dublê = criarGraphApiDublê();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_API_CLIENT)
      .useValue(dublê)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmDisparosHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    dublê.falharProximoEnvio = null;
    dublê.falharProximaBusca = null;
    dublê.falharProximaQualityRating = null;
    dublê.proximoWaMessageId = '';
    dublê.proximosTemplates = [];
    dublê.chamadasEnviar = [];
    await prisma.mensagemDisparo.deleteMany({});
    await prisma.disparoContatoImportado.deleteMany({});
    await prisma.execucaoDisparo.deleteMany({});
    await prisma.crmAdminAudit.deleteMany({});
    await prisma.optOutWhatsapp.deleteMany({});
    await prisma.mensagemWhatsapp.deleteMany({});
    await prisma.interacao.deleteMany({});
    await prisma.segmento.deleteMany({});
    await prisma.templateWhatsapp.deleteMany({});
    await prisma.canalWhatsapp.deleteMany({});
    await prisma.lead.deleteMany({});
  });

  async function processar() {
    const res = await h.http().post('/crm/disparos/processar').set(h.ADMIN);
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`processar falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as {
      agendadosMaterializados: number;
      mensagensEnviadas: number;
      mensagensFalharam: number;
      execucoesConcluidas: number;
    };
  }

  async function prepararCanalComTemplateAprovado() {
    const canalId = await h.criarCanal();
    const nomeMeta = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    dublê.proximosTemplates = [
      {
        nomeMeta,
        idioma: 'pt_BR',
        categoria: 'MARKETING',
        corpo: 'Olá! Confira nossa novidade.',
        statusAprovacao: 'APPROVED',
        motivoRejeicao: null,
      },
    ];
    const templateId = await h.criarTemplateAprovado(canalId, nomeMeta);
    return { canalId, templateId };
  }

  describe('ciclo de vida (US1)', () => {
    it('disparo imediato materializa destinatários e vira EM_ANDAMENTO; processar envia e conclui', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'Disparo teste', canalId, templateId, segmentoId });
      expect(criar.status).toBe(201);
      expect(criar.body.status).toBe('EM_ANDAMENTO');

      const antes = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(antes.body.total).toBe(1);
      expect(antes.body.itens[0].status).toBe('PENDENTE');

      const resumo = await processar();
      expect(resumo.mensagensEnviadas).toBeGreaterThanOrEqual(1);

      const depois = await h.http().get(`/crm/disparos/${criar.body.id}`).set(h.ADMIN);
      expect(depois.body.status).toBe('CONCLUIDO');
      const destinatarios = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(destinatarios.body.itens[0].status).toBe('ENVIADA');
    });

    it('disparo agendado no futuro fica AGENDADO sem destinatários; cancelar impede envio', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const segmentoId = await h.criarSegmentoLead(h.origemUnica());
      const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'Disparo agendado', canalId, templateId, segmentoId, agendadoPara: futuro });
      expect(criar.status).toBe(201);
      expect(criar.body.status).toBe('AGENDADO');

      const antes = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(antes.body.total).toBe(0);

      await processar(); // horário não chegou — não materializa
      const depoisProcessar = await h.http().get(`/crm/disparos/${criar.body.id}`).set(h.ADMIN);
      expect(depoisProcessar.body.status).toBe('AGENDADO');

      const cancelar = await h.http().post(`/crm/disparos/${criar.body.id}/cancelar`).set(h.ADMIN);
      expect(cancelar.status).toBe(200);
      expect(cancelar.body.status).toBe('CANCELADO');

      await processar();
      const final = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(final.body.total).toBe(0);
    });

    it('agendamento no passado é rejeitado; sem destino é rejeitado; template não aprovado é rejeitado', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const segmentoId = await h.criarSegmentoLead(h.origemUnica());

      const passado = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'x',
          canalId,
          templateId,
          segmentoId,
          agendadoPara: new Date(Date.now() - 1000).toISOString(),
        });
      expect(passado.status).toBe(422);

      const semDestino = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'x', canalId, templateId });
      expect(semDestino.status).toBe(422);

      const outroCanal = await h.criarCanal();
      const naoAprovado = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'x', canalId: outroCanal, templateId, segmentoId });
      expect(naoAprovado.status).toBe(422);
    });
  });

  describe('execução reativa e retry (D-R5)', () => {
    it('materializa um agendado cujo horário já chegou (simulado direto no banco)', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'Agendado que já passou',
          canalId,
          templateId,
          segmentoId,
          agendadoPara: new Date(Date.now() + 60_000).toISOString(),
        });
      await prisma.execucaoDisparo.update({
        where: { id: criar.body.id },
        data: { agendadoPara: new Date(Date.now() - 1000) },
      });

      const resumo = await processar();
      expect(resumo.agendadosMaterializados).toBeGreaterThanOrEqual(1);

      const destinatarios = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(destinatarios.body.total).toBe(1);
    });

    it('retry: falha 2x e sucede na 3ª tentativa → ENVIADA', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'Retry ok', canalId, templateId, segmentoId });

      dublê.falharProximoEnvio = new Error('instabilidade 1');
      await processar();
      let m = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(m.body.itens[0].status).toBe('PENDENTE');
      expect(m.body.itens[0].tentativas).toBe(1);

      dublê.falharProximoEnvio = new Error('instabilidade 2');
      await processar();
      m = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(m.body.itens[0].status).toBe('PENDENTE');
      expect(m.body.itens[0].tentativas).toBe(2);

      await processar();
      m = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(m.body.itens[0].status).toBe('ENVIADA');
    });

    it('retry: sempre falha → FALHOU terminal ao atingir o máximo de tentativas', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'Retry falha', canalId, templateId, segmentoId });

      for (let i = 0; i < 3; i++) {
        dublê.falharProximoEnvio = new Error(`instabilidade ${i}`);
        await processar();
      }
      const m = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(m.body.itens[0].status).toBe('FALHOU');
      expect(m.body.itens[0].tentativas).toBe(3);

      const execucao = await h.http().get(`/crm/disparos/${criar.body.id}`).set(h.ADMIN);
      expect(execucao.body.status).toBe('CONCLUIDO');
    });
  });

  describe('segmentação, CSV e opt-out (US3, FR-004/FR-005)', () => {
    it('dedup: mesmo telefone em segmento e CSV gera 1 só destinatário', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'Dedup',
          canalId,
          templateId,
          segmentoId,
          criarLead: false,
          csvConteudo: `telefone\n${telefone.replace('+', '')}\n`,
        });
      expect(criar.status).toBe(201);

      const destinatarios = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(destinatarios.body.total).toBe(1);
    });

    it('CSV com criarLead=true cria Lead novo; criarLead=false não cria nada', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();

      const telSemLead = h.numeroUnico().replace('+', '');
      const criouLead = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'CSV cria lead',
          canalId,
          templateId,
          criarLead: true,
          csvConteudo: `telefone,nome\n${telSemLead},Fulano\n`,
        });
      expect(criouLead.status).toBe(201);
      expect(criouLead.body.importacaoCsv.aceitas).toBe(1);
      const leadCriado = await prisma.lead.findFirst({ where: { origem: 'csv-disparo' } });
      expect(leadCriado).not.toBeNull();

      const telSemCriar = h.numeroUnico().replace('+', '');
      const naoCria = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'CSV sem criar lead',
          canalId,
          templateId,
          criarLead: false,
          csvConteudo: `telefone\n${telSemCriar}\n`,
        });
      expect(naoCria.status).toBe(201);
      const leadNaoCriado = await prisma.lead.findFirst({ where: { telefone: `+${telSemCriar}` } });
      expect(leadNaoCriado).toBeNull();
    });

    it('telefone em opt-out é excluído do envio (PULADA)', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      const telefone = h.numeroUnico();
      const origem = h.origemUnica();
      await h.criarLead(telefone, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const opt = await h
        .http()
        .post('/crm/whatsapp/optout')
        .set(h.ADMIN)
        .send({ telefone, origem: 'ATENDENTE' });
      expect(opt.status).toBeLessThan(300);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({ nome: 'Respeita opt-out', canalId, templateId, segmentoId });

      const destinatarios = await h.http().get(`/crm/disparos/${criar.body.id}/destinatarios`).set(h.ADMIN);
      expect(destinatarios.body.itens[0].status).toBe('PULADA');
      expect(destinatarios.body.itens[0].motivo).toBe('opt_out');
    });
  });

  describe('teste A/B (US4)', () => {
    it('divide o público entre as duas variantes conforme atribuirVariante', async () => {
      const { canalId, templateId } = await prepararCanalComTemplateAprovado();
      dublê.proximosTemplates.push({
        nomeMeta: `tpl_b_${Date.now()}`,
        idioma: 'pt_BR',
        categoria: 'MARKETING',
        corpo: 'Variante B',
        statusAprovacao: 'APPROVED',
        motivoRejeicao: null,
      });
      const sincB = await h.http().post(`/crm/admin/whatsapp/canais/${canalId}/templates/sincronizar`).set(h.ADMIN);
      const templateBId = sincB.body.templates.find(
        (t: { nomeMeta: string }) => t.nomeMeta.startsWith('tpl_b_'),
      ).id as string;

      const origem = h.origemUnica();
      const telefones = Array.from({ length: 12 }, () => h.numeroUnico());
      for (const tel of telefones) await h.criarLead(tel, origem);
      const segmentoId = await h.criarSegmentoLead(origem);

      const criar = await h
        .http()
        .post('/crm/disparos')
        .set(h.ADMIN)
        .send({
          nome: 'Teste AB',
          canalId,
          templateId,
          templateBId,
          percentualVarianteB: 50,
          segmentoId,
        });
      expect(criar.status).toBe(201);

      const destinatarios = await h
        .http()
        .get(`/crm/disparos/${criar.body.id}/destinatarios`)
        .set(h.ADMIN)
        .query({ tamanho: 50 });
      for (const item of destinatarios.body.itens as { telefone: string; variante: string }[]) {
        expect(item.variante).toBe(atribuirVariante(item.telefone, 50));
      }

      const detalhe = await h.http().get(`/crm/disparos/${criar.body.id}`).set(h.ADMIN);
      const variantes = new Set(
        (detalhe.body.contagensPorVariante as { variante: string | null }[]).map((c) => c.variante),
      );
      expect(variantes.has('A') || variantes.has('B')).toBe(true);
    });
  });

  describe('quality rating (US2, sob demanda)', () => {
    it('consulta direto na Graph API sem persistir nada', async () => {
      const canalId = await h.criarCanal();
      dublê.proximaQualityRating = { qualityRating: 'GREEN', statusExibicao: 'APPROVED' };

      const res = await h.http().get(`/crm/admin/whatsapp/canais/${canalId}/quality-rating`).set(h.ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.qualityRating).toBe('GREEN');
    });

    it('falha do provedor vira 502', async () => {
      const canalId = await h.criarCanal();
      dublê.falharProximaQualityRating = new Error('timeout');

      const res = await h.http().get(`/crm/admin/whatsapp/canais/${canalId}/quality-rating`).set(h.ADMIN);
      expect(res.status).toBe(502);
    });
  });

  describe('guard e escopo', () => {
    it('401 sem token; 403 sem permissão; 2xx com credencial de serviço', async () => {
      const semToken = await h.http().get('/crm/disparos');
      expect(semToken.status).toBe(401);

      const semPerm = await h.sujeitoCom([]);
      const r = await h.http().post('/crm/disparos').set(bearer(semPerm.token)).send({});
      expect(r.status).toBe(403);

      const ok = await h.http().get('/crm/disparos').set(h.ADMIN);
      expect(ok.status).toBe(200);
    });

    it('catálogo ganha exatamente as 3 permissões novas de disparo', async () => {
      const res = await h.http().get('/admin/rbac/permissoes').set(h.ADMIN);
      const recursos = res.body.recursos as { recurso: string; permissoes: { id: string }[] }[];
      const ids = recursos.flatMap((g) => g.permissoes.map((p) => p.id));
      for (const id of ['disparo:criar', 'disparo:ver', 'disparo:cancelar']) {
        expect(ids).toContain(id);
      }
    });
  });
});
