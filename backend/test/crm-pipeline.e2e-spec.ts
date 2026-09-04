import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PortaObservacaoPagamentoService } from '../src/crm/application/pipeline/porta-observacao-pagamento.service';
import { authHeader } from './support/auth';
import { crmPipelineHelpers } from './support/crm-pipeline';

/**
 * spec 010 — Pipeline de Vendas do CRM (e2e, Postgres real). Pipeline/etapa
 * configuráveis, oportunidade (âncora XOR), mover com motivo obrigatório só
 * em etapa PERDIDA, histórico de movimentação, escopo `ver_todas`/
 * `ver_proprias`, atribuição automática (round robin + regra), SLA/esfriando
 * derivados, campos personalizados, métricas, porta de observação de
 * pagamento, guard 401/403/2xx, catálogo +6, `CONTEXT_MODULES` = 11.
 */
describe('crm — Pipeline/Oportunidade (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmPipelineHelpers>;
  const ADMIN = authHeader();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmPipelineHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // A US5 ("esfriando") registra `interacao` para exercitar o cálculo —
    // `interacao.pessoa_id`/`lead_id` são `onDelete: Restrict` (009), então
    // precisa sumir antes de qualquer `pessoa.deleteMany({})` de outra suíte
    // (ex.: clientes.e2e-spec.ts).
    await prisma.interacao.deleteMany({});
    await prisma.crmPipelineAudit.deleteMany({});
    await prisma.valorCampoOportunidade.deleteMany({});
    await prisma.campoPersonalizadoOportunidade.deleteMany({});
    await prisma.oportunidadeMovimentacao.deleteMany({});
    await prisma.oportunidade.deleteMany({});
    await prisma.regraAtribuicaoPipeline.deleteMany({});
    await prisma.etapaPipeline.deleteMany({});
    await prisma.pipeline.deleteMany({});
    // `equipe_membro.usuario_id` é `onDelete: Restrict` (007) — sem isto, o
    // `usuario.deleteMany({})` global de outra suíte (ex.: rbac.e2e-spec.ts)
    // quebra por FK apontando para os membros que esta suíte criou.
    await prisma.equipeMembro.deleteMany({});
    await prisma.equipe.deleteMany({});
  });

  const http = () => request(app.getHttpServer());

  // ------------------------------------------------------------ US1: pipeline/etapa/oportunidade

  describe('US1 — pipeline, etapa e criação de oportunidade', () => {
    it('cria pipeline sem etapa, depois 3 etapas ordenadas', async () => {
      const p = await http().post('/crm/pipelines').set(ADMIN).send({ nome: 'Mentoria' });
      expect(p.status).toBe(201);
      expect(p.body.ativo).toBe(true);
      expect(p.body.etapas).toEqual([]);

      const { pipelineId, aberta, ganha, perdida } = await h.criarPipelineCompleto();
      const etapas = await http().get(`/crm/pipelines/${pipelineId}/etapas`).set(ADMIN);
      expect(etapas.body.itens.map((e: { id: string }) => e.id)).toEqual([aberta, ganha, perdida]);
    });

    it('pipeline sem etapa ABERTA recusa criação de oportunidade (422)', async () => {
      const p = await http().post('/crm/pipelines').set(ADMIN).send({ nome: 'Sem etapa' });
      const pessoaId = await h.criarPessoa();
      const r = await h.criarOportunidade(p.body.id, { pessoaId });
      expect(r.status).toBe(422);
    });

    it('cria oportunidade a partir de lead: nasce na 1ª etapa ABERTA + 1ª movimentação', async () => {
      const { pipelineId, aberta } = await h.criarPipelineCompleto();
      const leadId = await h.criarLead();
      const r = await h.criarOportunidade(pipelineId, { leadId });
      expect(r.status).toBe(201);
      expect(r.body.etapaId).toBe(aberta);
      expect(r.body.status).toBe('ABERTA');

      const movs = await http().get(`/crm/oportunidades/${r.body.id}/movimentacoes`).set(ADMIN);
      expect(movs.body.itens).toHaveLength(1);
      expect(movs.body.itens[0].etapaAnteriorId).toBeNull();
      expect(movs.body.itens[0].etapaNovaId).toBe(aberta);
    });

    it('pessoaId e leadId juntos ou nenhum → 422', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const pessoaId = await h.criarPessoa();
      const leadId = await h.criarLead();
      const ambos = await h.criarOportunidade(pipelineId, { pessoaId, leadId });
      expect(ambos.status).toBe(422);
      const nenhum = await h.criarOportunidade(pipelineId, {});
      expect(nenhum.status).toBe(422);
    });

    it('DELETE de etapa em uso → 409; sem uso → sucede', async () => {
      const { pipelineId, aberta, perdida } = await h.criarPipelineCompleto();
      const leadId = await h.criarLead();
      await h.criarOportunidade(pipelineId, { leadId });

      const semUso = await http()
        .delete(`/crm/pipelines/${pipelineId}/etapas/${perdida}`)
        .set(ADMIN);
      expect(semUso.status).toBe(200);

      const emUso = await http()
        .delete(`/crm/pipelines/${pipelineId}/etapas/${aberta}`)
        .set(ADMIN);
      expect(emUso.status).toBe(409);
    });
  });

  // ------------------------------------------------------------ US2: mover

  describe('US2 — mover com motivo obrigatório em PERDIDA', () => {
    it('move entre etapas ABERTA sem motivo; entra em PERDIDA sem motivo → 422; com motivo → sucede', async () => {
      const { pipelineId, aberta, perdida } = await h.criarPipelineCompleto();
      const outraAberta = await http()
        .post(`/crm/pipelines/${pipelineId}/etapas`)
        .set(ADMIN)
        .send({ nome: 'Proposta', ordem: 3, tipo: 'ABERTA' });
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId });

      const m1 = await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: outraAberta.body.id });
      expect(m1.status).toBe(201);
      expect(m1.body.etapaId).toBe(outraAberta.body.id);

      const semMotivo = await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: perdida });
      expect(semMotivo.status).toBe(422);

      const comMotivo = await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: perdida, motivo: 'Optou por concorrente' });
      expect(comMotivo.status).toBe(201);
      expect(comMotivo.body.status).toBe('PERDIDA');

      const movs = await http().get(`/crm/oportunidades/${o.body.id}/movimentacoes`).set(ADMIN);
      expect(movs.body.itens).toHaveLength(3); // criação + 2 movimentos

      // no-op: mover para a etapa atual não cria nova movimentação
      await http().post(`/crm/oportunidades/${o.body.id}/mover`).set(ADMIN).send({ etapaId: perdida });
      const movs2 = await http().get(`/crm/oportunidades/${o.body.id}/movimentacoes`).set(ADMIN);
      expect(movs2.body.itens).toHaveLength(3);

      // reabertura de PERDIDA para ABERTA não exige motivo
      const reabre = await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: aberta });
      expect(reabre.status).toBe(201);
    });

    it('etapa de outro pipeline → 422', async () => {
      const a = await h.criarPipelineCompleto();
      const b = await h.criarPipelineCompleto();
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(a.pipelineId, { leadId });
      const r = await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: b.aberta });
      expect(r.status).toBe(422);
    });
  });

  // ------------------------------------------------------------ US3: escopo

  describe('US3 — escopo de visão por responsável', () => {
    it('ver_proprias só vê as próprias; ver_todas vê todas; serviço equivale a ver_todas', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const dono = await h.sujeitoCom(['oportunidade:ver_proprias']);
      const leadA = await h.criarLead();
      const leadB = await h.criarLead();
      const leadC = await h.criarLead();
      const oA = await h.criarOportunidade(pipelineId, { leadId: leadA }, { responsavelId: dono.usuarioId });
      await h.criarOportunidade(pipelineId, { leadId: leadB });
      await h.criarOportunidade(pipelineId, { leadId: leadC });

      const listaPropria = await http()
        .get(`/crm/oportunidades?pipelineId=${pipelineId}`)
        .set(bearer(dono.token));
      expect(listaPropria.body.itens.map((o: { id: string }) => o.id)).toEqual([oA.body.id]);

      const outra = await http()
        .get(`/crm/oportunidades/${(await h.criarOportunidade(pipelineId, { leadId: leadB })).body.id}`)
        .set(bearer(dono.token));
      expect(outra.status).toBe(404);

      const todas = await h.sujeitoCom(['oportunidade:ver_todas']);
      const listaTodas = await http()
        .get(`/crm/oportunidades?pipelineId=${pipelineId}`)
        .set(bearer(todas.token));
      expect(listaTodas.body.itens.length).toBeGreaterThanOrEqual(3);

      const viaServico = await http().get(`/crm/oportunidades?pipelineId=${pipelineId}`).set(ADMIN);
      expect(viaServico.status).toBe(200);
    });
  });

  // ------------------------------------------------------------ US4: atribuição automática

  describe('US4 — atribuição automática (round robin e regra)', () => {
    it('RODIZIO distribui em ordem entre membros ativos e volta ao início', async () => {
      const equipeId = await h.criarEquipe();
      const u1 = await h.criarUsuario();
      const u2 = await h.criarUsuario();
      await h.adicionarMembro(equipeId, u1);
      await h.adicionarMembro(equipeId, u2);
      const { pipelineId } = await h.criarPipelineCompleto({ equipeId, modoAtribuicao: 'RODIZIO' });

      const responsaveis: string[] = [];
      for (let i = 0; i < 3; i++) {
        const leadId = await h.criarLead();
        const o = await h.criarOportunidade(pipelineId, { leadId });
        expect(o.status).toBe(201);
        responsaveis.push(o.body.responsavelId as string);
      }
      expect(responsaveis).toEqual([u1, u2, u1]);
    });

    it('RODIZIO sem membro ativo: nasce sem responsável (nunca erro)', async () => {
      const equipeId = await h.criarEquipe();
      const { pipelineId } = await h.criarPipelineCompleto({ equipeId, modoAtribuicao: 'RODIZIO' });
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId });
      expect(o.status).toBe(201);
      expect(o.body.responsavelId).toBeNull();
    });

    it('REGRA casa por origem; sem match cai no fallback RODIZIO', async () => {
      const equipeId = await h.criarEquipe();
      const uRodizio = await h.criarUsuario();
      await h.adicionarMembro(equipeId, uRodizio);
      const uRegra = await h.criarUsuario();
      const { pipelineId } = await h.criarPipelineCompleto({ equipeId, modoAtribuicao: 'REGRA' });

      const put = await http()
        .put(`/crm/pipelines/${pipelineId}/atribuicao`)
        .set(ADMIN)
        .send({
          modoAtribuicao: 'REGRA',
          atribuicaoFallback: 'RODIZIO',
          regras: [{ ordem: 0, campo: 'ORIGEM', valor: { igual: 'instagram' }, responsavelId: uRegra }],
        });
      expect(put.status).toBe(200);

      const leadCasa = await h.criarLead({ origem: 'instagram' });
      const oCasa = await h.criarOportunidade(pipelineId, { leadId: leadCasa });
      expect(oCasa.body.responsavelId).toBe(uRegra);

      const leadNaoCasa = await h.criarLead({ origem: 'google' });
      const oNaoCasa = await h.criarOportunidade(pipelineId, { leadId: leadNaoCasa });
      expect(oNaoCasa.body.responsavelId).toBe(uRodizio);
    });

    it('responsavelId explícito sempre vence a atribuição automática', async () => {
      const equipeId = await h.criarEquipe();
      const u1 = await h.criarUsuario();
      await h.adicionarMembro(equipeId, u1);
      const explicito = await h.criarUsuario();
      const { pipelineId } = await h.criarPipelineCompleto({ equipeId, modoAtribuicao: 'RODIZIO' });
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId }, { responsavelId: explicito });
      expect(o.body.responsavelId).toBe(explicito);
    });

    it('PUT atribuição sem crm_admin:gerir_pipelines → 403', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const semPerm = await h.sujeitoCom([]);
      const r = await http()
        .put(`/crm/pipelines/${pipelineId}/atribuicao`)
        .set(bearer(semPerm.token))
        .send({ modoAtribuicao: 'MANUAL', atribuicaoFallback: null, regras: [] });
      expect(r.status).toBe(403);
    });
  });

  // ------------------------------------------------------------ US5: SLA e esfriando

  describe('US5 — SLA por etapa e esfriando (derivados)', () => {
    it('slaEstourado recalculado a partir de entrouEtapaEm no passado', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const slaCurta = await http()
        .post(`/crm/pipelines/${pipelineId}/etapas`)
        .set(ADMIN)
        .send({ nome: 'SLA curto', ordem: 5, tipo: 'ABERTA', slaHoras: 1 });
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId });
      await http()
        .post(`/crm/oportunidades/${o.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: slaCurta.body.id });

      await prisma.oportunidade.update({
        where: { id: o.body.id },
        data: { entrouEtapaEm: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });

      const detalhe = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(detalhe.body.slaEstourado).toBe(true);

      const filtro = await http()
        .get(`/crm/oportunidades?pipelineId=${pipelineId}&slaEstourado=true`)
        .set(ADMIN);
      expect(filtro.body.itens.map((i: { id: string }) => i.id)).toContain(o.body.id);
    });

    it('etapa sem slaHoras: slaEstourado sempre false', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId });
      const detalhe = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(detalhe.body.slaEstourado).toBe(false);
    });

    it('esfriando: sem interação recente e diasEsfriando baixo → true; nova interação reseta', async () => {
      const { pipelineId } = await h.criarPipelineCompleto({ diasEsfriando: 1 });
      const pessoaId = await h.criarPessoa();
      const o = await h.criarOportunidade(pipelineId, { pessoaId });

      await prisma.oportunidade.update({
        where: { id: o.body.id },
        data: { criadoEm: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });
      const antes = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(antes.body.esfriando).toBe(true);

      await http()
        .post('/crm/interacoes')
        .set(ADMIN)
        .send({ pessoaId, tipo: 'NOTA', conteudo: 'contato recente' });
      const depois = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(depois.body.esfriando).toBe(false);
    });

    it('diasEsfriando null: esfriando sempre false', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();
      const pessoaId = await h.criarPessoa();
      const o = await h.criarOportunidade(pipelineId, { pessoaId });
      const detalhe = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(detalhe.body.esfriando).toBe(false);
    });
  });

  // ------------------------------------------------------------ US6: campos personalizados e métricas

  describe('US6 — campos personalizados e métricas', () => {
    it('define campo, grava valor válido, recusa valor fora de opcoes', async () => {
      const def = await http()
        .post('/crm/admin/campos-oportunidade')
        .set(ADMIN)
        .send({ chave: 'produto_interesse', rotulo: 'Produto', tipo: 'SELECAO', opcoes: ['A', 'B'] });
      expect(def.status).toBe(201);

      const { pipelineId } = await h.criarPipelineCompleto();
      const leadId = await h.criarLead();
      const o = await h.criarOportunidade(pipelineId, { leadId });

      const invalido = await http()
        .put(`/crm/oportunidades/${o.body.id}/campos-personalizados`)
        .set(ADMIN)
        .send({ produto_interesse: 'Z' });
      expect(invalido.status).toBe(422);

      const valido = await http()
        .put(`/crm/oportunidades/${o.body.id}/campos-personalizados`)
        .set(ADMIN)
        .send({ produto_interesse: 'A' });
      expect(valido.status).toBe(200);
      expect(valido.body.produto_interesse).toBe('A');

      const auditoria = await prisma.crmPipelineAudit.count({
        where: { entidade: 'valor_campo_oportunidade', entidadeId: o.body.id },
      });
      expect(auditoria).toBeGreaterThan(0);
    });

    it('métricas somam por etapa/moeda e calculam taxaConversao; pipeline vazio → zerado', async () => {
      const { pipelineId, ganha, perdida } = await h.criarPipelineCompleto();

      const vazio = await http().get(`/crm/pipelines/${pipelineId}/metricas`).set(ADMIN);
      expect(vazio.body.taxaConversao).toBeNull();

      const lead1 = await h.criarLead();
      const o1 = await h.criarOportunidade(pipelineId, { leadId: lead1 });
      await http().post(`/crm/oportunidades/${o1.body.id}/mover`).set(ADMIN).send({ etapaId: ganha });

      const lead2 = await h.criarLead();
      const o2 = await h.criarOportunidade(pipelineId, { leadId: lead2 });
      await http()
        .post(`/crm/oportunidades/${o2.body.id}/mover`)
        .set(ADMIN)
        .send({ etapaId: perdida, motivo: 'sem orçamento' });

      const metricas = await http().get(`/crm/pipelines/${pipelineId}/metricas`).set(ADMIN);
      expect(metricas.body.taxaConversao).toBeCloseTo(0.5);
      const etapaGanha = metricas.body.porEtapa.find((e: { etapaId: string }) => e.etapaId === ganha);
      expect(etapaGanha.quantidade).toBe(1);
      expect(etapaGanha.valorEstimado).toEqual([{ valorInt: '500000000', moeda: 'BRL' }]);
    });
  });

  // ------------------------------------------------------------ porta de observação de pagamento

  describe('Porta PortaObservacaoPagamentoCrm (D-02/FR-023)', () => {
    it('move oportunidade ABERTA da pessoa para a 1ª etapa GANHA; idempotente; sem oportunidade → no-op', async () => {
      const porta = app.get(PortaObservacaoPagamentoService);
      const { pipelineId, ganha } = await h.criarPipelineCompleto();
      const pessoaId = await h.criarPessoa();
      const o = await h.criarOportunidade(pipelineId, { pessoaId });

      await porta.observarPagamentoConfirmado({ pessoaId });
      const depois = await http().get(`/crm/oportunidades/${o.body.id}`).set(ADMIN);
      expect(depois.body.etapaId).toBe(ganha);
      expect(depois.body.status).toBe('GANHA');

      const movsAntes = await http().get(`/crm/oportunidades/${o.body.id}/movimentacoes`).set(ADMIN);
      await porta.observarPagamentoConfirmado({ pessoaId }); // 2ª chamada — idempotente
      const movsDepois = await http().get(`/crm/oportunidades/${o.body.id}/movimentacoes`).set(ADMIN);
      expect(movsDepois.body.itens.length).toBe(movsAntes.body.itens.length);

      const semOportunidade = await h.criarPessoa();
      await expect(porta.observarPagamentoConfirmado({ pessoaId: semOportunidade })).resolves.toBeUndefined();
    });
  });

  // ------------------------------------------------------------ guard/catálogo/regressão

  describe('guard, catálogo e regressão', () => {
    it('401 sem token; 403 sem permissão; 2xx com credencial de serviço', async () => {
      const semToken = await http().get('/crm/oportunidades');
      expect(semToken.status).toBe(401);

      const semPerm = await h.sujeitoCom([]);
      const r = await http().post('/crm/oportunidades').set(bearer(semPerm.token)).send({});
      expect(r.status).toBe(403);

      const ok = await http().get('/crm/pipelines').set(ADMIN);
      expect(ok.status).toBe(200);
    });

    it('catálogo ganha exatamente as 6 permissões novas', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const recursos = res.body.recursos as { recurso: string; permissoes: { id: string }[] }[];
      const ids = recursos.flatMap((g) => g.permissoes.map((p) => p.id));
      for (const id of [
        'oportunidade:criar',
        'oportunidade:editar',
        'oportunidade:mover',
        'oportunidade:ver_todas',
        'oportunidade:ver_proprias',
        'crm_admin:gerir_pipelines',
      ]) {
        expect(ids).toContain(id);
      }
    });

    it('/health continua afirmando 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.status).toBe(200);
      expect((res.body.contexts as unknown[]).length).toBe(11);
    });
  });
});
