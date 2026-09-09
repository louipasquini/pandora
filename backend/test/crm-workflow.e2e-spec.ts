import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { crmPipelineHelpers } from './support/crm-pipeline';

/**
 * spec 014 — CRM · Workflow (e2e, Postgres real). Ciclo de vida do fluxo
 * (US1/US3, D-01), simulação sem efeito colateral (US2, D-03), execução
 * reativa idempotente (D-06), biblioteca de modelos (US4, CL-02), guard/
 * escopo, regressão dos 11 contextos (`/health`, `context-modules.e2e-spec`).
 */
describe('crm — Workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmPipelineHelpers>;
  const ADMIN = authHeader();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmPipelineHelpers(app);

    // research.md D-R9: a 1ª passada só estabelece a linha de partida do
    // cursor de cada fonte — nunca processa histórico. 1 chamada de
    // "aquecimento" antes de qualquer cenário reativo desta suíte.
    await http().post('/crm/workflow/processar').set(ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.execucaoFluxo.deleteMany({});
    await prisma.fluxoAutomacaoVersao.deleteMany({});
    await prisma.fluxoAutomacao.deleteMany({});
    await prisma.tagAssociacao.deleteMany({});
    await prisma.crmLeadAudit.deleteMany({});
    await prisma.oportunidadeMovimentacao.deleteMany({});
    await prisma.oportunidade.deleteMany({});
    await prisma.etapaPipeline.deleteMany({});
    await prisma.pipeline.deleteMany({});
    await prisma.lead.deleteMany({});
  });

  async function processar() {
    const res = await http().post('/crm/workflow/processar').set(ADMIN);
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`processar falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as { fontesVarridas: string[]; execucoesCriadas: number; execucoesFalharam: number };
  }

  async function criarFluxo(gatilhoTipo: string, over: Record<string, unknown> = {}) {
    const res = await http()
      .post('/crm/workflow/fluxos')
      .set(ADMIN)
      .send({ nome: `Fluxo ${Math.random().toString(36).slice(2, 7)}`, gatilhoTipo, ...over });
    if (res.status !== 201) throw new Error(`criarFluxo falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body as { id: string; versaoRascunho: { id: string } };
  }

  async function publicarRascunho(
    fluxoId: string,
    rascunho: { gatilhoTipo: string; condicoes: unknown; acoes: unknown[] },
  ) {
    const put = await http().put(`/crm/workflow/fluxos/${fluxoId}/rascunho`).set(ADMIN).send(rascunho);
    if (put.status !== 200) throw new Error(`rascunho falhou ${put.status}: ${JSON.stringify(put.body)}`);
    const pub = await http().post(`/crm/workflow/fluxos/${fluxoId}/publicar`).set(ADMIN);
    if (pub.status !== 201 && pub.status !== 200) {
      throw new Error(`publicar falhou ${pub.status}: ${JSON.stringify(pub.body)}`);
    }
    return pub.body;
  }

  describe('ciclo de vida (US1/US3)', () => {
    it('cria fluxo com rascunho v1 vazio', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      expect(f.versaoRascunho).toBeTruthy();
      const obtido = await http().get(`/crm/workflow/fluxos/${f.id}`).set(ADMIN);
      expect(obtido.body.versaoPublicada).toBeNull();
      expect(obtido.body.versaoRascunho.status).toBe('RASCUNHO');
    });

    it('publicar promove o rascunho e arquivar remove a publicada', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      await publicarRascunho(f.id, {
        gatilhoTipo: 'LEAD_CRIADO',
        condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
        acoes: [{ tipo: 'APLICAR_TAG', tag: 'x' }],
      });
      const obtido = await http().get(`/crm/workflow/fluxos/${f.id}`).set(ADMIN);
      expect(obtido.body.versaoPublicada.status).toBe('PUBLICADA');
      expect(obtido.body.versaoRascunho).toBeNull();

      const arquivar = await http().post(`/crm/workflow/fluxos/${f.id}/arquivar`).set(ADMIN);
      expect(arquivar.status).toBe(201);
      const semPublicada = await http().post(`/crm/workflow/fluxos/${f.id}/arquivar`).set(ADMIN);
      expect(semPublicada.status).toBe(409);
    });

    it('editar depois de publicado cria v2 sem alterar a v1 publicada (US3)', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      await publicarRascunho(f.id, {
        gatilhoTipo: 'LEAD_CRIADO',
        condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
        acoes: [{ tipo: 'APLICAR_TAG', tag: 'v1' }],
      });
      const rascunhoNovo = await http()
        .put(`/crm/workflow/fluxos/${f.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'LEAD_CRIADO',
          condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
          acoes: [{ tipo: 'APLICAR_TAG', tag: 'v2' }],
        });
      expect(rascunhoNovo.status).toBe(200);
      expect(rascunhoNovo.body.numero).toBe(2);

      const obtido = await http().get(`/crm/workflow/fluxos/${f.id}`).set(ADMIN);
      expect(obtido.body.versaoPublicada.numero).toBe(1);
      expect(obtido.body.versaoPublicada.acoes).toEqual([{ tipo: 'APLICAR_TAG', tag: 'v1' }]);
      expect(obtido.body.versaoRascunho.numero).toBe(2);
    });

    it('ação incompatível com o gatilho -> 422 no rascunho', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      const r = await http()
        .put(`/crm/workflow/fluxos/${f.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'LEAD_CRIADO',
          condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
          acoes: [{ tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: '00000000-0000-4000-8000-000000000000' }],
        });
      expect(r.status).toBe(422);
    });

    it('MOVER_OPORTUNIDADE_ETAPA para etapa PERDIDA sem motivo bloqueia o publicar', async () => {
      const { perdida } = await h.criarPipelineCompleto();
      const f = await criarFluxo('OPORTUNIDADE_ETAPA_MUDOU');
      await http()
        .put(`/crm/workflow/fluxos/${f.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU',
          condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
          acoes: [{ tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: perdida }],
        });
      const pub = await http().post(`/crm/workflow/fluxos/${f.id}/publicar`).set(ADMIN);
      expect(pub.status).toBe(422);
      expect(pub.body.erro).toBe('motivo_obrigatorio');
    });

    it('sem rascunho -> 422 ao publicar', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      await http().post(`/crm/workflow/fluxos/${f.id}/publicar`).set(ADMIN); // publica o vazio
      const semRascunho = await http().post(`/crm/workflow/fluxos/${f.id}/publicar`).set(ADMIN);
      expect(semRascunho.status).toBe(422);
    });
  });

  describe('simulação (US2, D-03)', () => {
    it('mostra o que aconteceria sem alterar o registro', async () => {
      const leadId = await h.criarLead({ origem: 'site' });
      const f = await criarFluxo('LEAD_CRIADO');
      await http()
        .put(`/crm/workflow/fluxos/${f.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'LEAD_CRIADO',
          condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
          acoes: [{ tipo: 'APLICAR_TAG', tag: 'simulado' }],
        });

      const antes = await http().get(`/crm/leads/${leadId}`).set(ADMIN);
      const sim = await http().post(`/crm/workflow/fluxos/${f.id}/simular`).set(ADMIN).send({
        registroTipo: 'LEAD',
        registroId: leadId,
      });
      expect(sim.status).toBe(201);
      expect(sim.body).toEqual({
        gatilhoCompativel: true,
        condicaoSatisfeita: true,
        acoesQueSeriamDisparadas: [{ tipo: 'APLICAR_TAG', tag: 'simulado' }],
      });

      const depois = await http().get(`/crm/leads/${leadId}`).set(ADMIN);
      expect(depois.body.tags).toEqual(antes.body.tags);
    });

    it('gatilho incompatível com o tipo de registro -> gatilhoCompativel false', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const op = await h.criarOportunidade(pipelineId, { leadId: await h.criarLead() });
      const f = await criarFluxo('LEAD_CRIADO');
      const sim = await http().post(`/crm/workflow/fluxos/${f.id}/simular`).set(ADMIN).send({
        registroTipo: 'OPORTUNIDADE',
        registroId: op.body.id,
      });
      expect(sim.body.gatilhoCompativel).toBe(false);
      expect(sim.body.acoesQueSeriamDisparadas).toEqual([]);
    });
  });

  describe('execução reativa (D-02/D-06/D-R6/D-R9)', () => {
    it('condição satisfeita aplica a ação; reprocessar não duplica (idempotência)', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      await publicarRascunho(f.id, {
        gatilhoTipo: 'LEAD_CRIADO',
        condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
        acoes: [{ tipo: 'APLICAR_TAG', tag: 'site' }],
      });

      const leadId = await h.criarLead({ origem: 'site' });
      const r1 = await processar();
      expect(r1.execucoesCriadas).toBe(1);

      const lead = await http().get(`/crm/leads/${leadId}`).set(ADMIN);
      expect(lead.body.tags).toContain('site');

      const r2 = await processar();
      expect(r2.execucoesCriadas).toBe(0); // D-06 — nada novo para processar

      const execs = await http().get(`/crm/workflow/fluxos/${f.id}/execucoes`).set(ADMIN);
      expect(execs.body.itens).toHaveLength(1);
      expect(execs.body.itens[0].resultado).toBe('EXECUTADA');
    });

    it('condição não satisfeita registra execução sem aplicar ação', async () => {
      const f = await criarFluxo('LEAD_CRIADO');
      await publicarRascunho(f.id, {
        gatilhoTipo: 'LEAD_CRIADO',
        condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
        acoes: [{ tipo: 'APLICAR_TAG', tag: 'site' }],
      });
      const leadId = await h.criarLead({ origem: 'ads' });
      await processar();

      const lead = await http().get(`/crm/leads/${leadId}`).set(ADMIN);
      expect(lead.body.tags).toEqual([]);

      const execs = await http().get(`/crm/workflow/fluxos/${f.id}/execucoes`).set(ADMIN);
      expect(execs.body.itens[0].resultado).toBe('CONDICAO_NAO_SATISFEITA');
    });

    it('ação move oportunidade de etapa; falha (pipeline diferente) fica isolada (D-R6)', async () => {
      const { pipelineId, ganha } = await h.criarPipelineCompleto();
      const outro = await h.criarPipelineCompleto();

      const f = await criarFluxo('OPORTUNIDADE_ETAPA_MUDOU');
      await publicarRascunho(f.id, {
        gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU',
        condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
        acoes: [{ tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: ganha }],
      });
      const fFalho = await criarFluxo('OPORTUNIDADE_ETAPA_MUDOU');
      await publicarRascunho(fFalho.id, {
        gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU',
        condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
        acoes: [{ tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: outro.ganha }],
      });

      const leadId = await h.criarLead();
      const op = await h.criarOportunidade(pipelineId, { leadId });
      expect(op.status).toBe(201);

      const resumo = await processar();
      expect(resumo.execucoesFalharam).toBe(1);

      const oportunidade = await http().get(`/crm/oportunidades/${op.body.id}`).set(ADMIN);
      expect(oportunidade.body.etapaId).toBe(ganha); // o fluxo válido moveu

      const execsFalho = await http().get(`/crm/workflow/fluxos/${fFalho.id}/execucoes`).set(ADMIN);
      expect(execsFalho.body.itens[0].resultado).toBe('FALHOU');
      expect(execsFalho.body.itens[0].erroDetalhe).toContain('pipeline_diferente');
    });
  });

  describe('biblioteca de modelos (US4, CL-02)', () => {
    it('lista modelos semeados e clona sem afetar o original', async () => {
      const lista = await http().get('/crm/workflow/modelos').set(ADMIN);
      expect(lista.body.itens.length).toBeGreaterThanOrEqual(3);
      const modelo = lista.body.itens[0];

      const clone = await http()
        .post(`/crm/workflow/modelos/${modelo.id}/usar-como-base`)
        .set(ADMIN)
        .send({ nome: 'Meu fluxo clonado' });
      expect(clone.status).toBe(201);
      expect(clone.body.versaoRascunho.gatilhoTipo).toBe(modelo.gatilhoTipo);
      expect(clone.body.versaoRascunho.acoes).toEqual(modelo.acoes);

      const listaDepois = await http().get('/crm/workflow/modelos').set(ADMIN);
      expect(listaDepois.body).toEqual(lista.body);
    });
  });

  describe('guard/escopo', () => {
    it('sem token -> 401', async () => {
      const r = await http().get('/crm/workflow/fluxos');
      expect(r.status).toBe(401);
    });

    it('crm_admin:ver sem gerir_workflow -> lê mas não escreve (403)', async () => {
      const { token } = await h.sujeitoCom(['crm_admin:ver']);
      const bearer = { Authorization: `Bearer ${token}` };
      const leitura = await http().get('/crm/workflow/fluxos').set(bearer);
      expect(leitura.status).toBe(200);
      const escrita = await http().post('/crm/workflow/fluxos').set(bearer).send({
        nome: 'x',
        gatilhoTipo: 'LEAD_CRIADO',
      });
      expect(escrita.status).toBe(403);
    });
  });
});
