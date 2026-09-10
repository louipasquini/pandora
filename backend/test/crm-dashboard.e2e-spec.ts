import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, issueUserToken } from './support/auth';
import { crmPipelineHelpers } from './support/crm-pipeline';

/**
 * spec 017 — CRM · Dashboard (e2e, Postgres real). Métricas derivadas por query
 * (Princípio V — nenhum contador), comparação período-a-período, funil, ranking,
 * qualidade de atendimento, metas com atingimento derivado + notificações
 * in-app, visões salvas + compartilhadas + export CSV, escopo de visão,
 * fronteira do `crm`. Catálogo RBAC +2, `CONTEXT_MODULES` = 11.
 */
describe('crm — Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmPipelineHelpers>;
  const ADMIN = authHeader();
  const http = () => request(app.getHttpServer());

  // Janela de teste: agosto/2026 (fixa, para o "período anterior" ser determinístico).
  const DE = '2026-08-01';
  const ATE = '2026-08-31';
  const dentro = new Date('2026-08-15T12:00:00Z');
  const antes = new Date('2026-07-15T12:00:00Z');

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
    await prisma.crmDashboardAudit.deleteMany({});
    await prisma.dashboardVisao.deleteMany({});
    await prisma.metaComercial.deleteMany({});
    await prisma.interacao.deleteMany({});
    await prisma.respostaAtendimento.deleteMany({});
    await prisma.transferenciaAtendimento.deleteMany({});
    await prisma.atendimento.deleteMany({});
    await prisma.crmTarefaAudit.deleteMany({});
    await prisma.tarefa.deleteMany({});
    await prisma.crmLeadAudit.deleteMany({});
    await prisma.oportunidadeMovimentacao.deleteMany({});
    await prisma.oportunidade.deleteMany({});
    await prisma.etapaPipeline.deleteMany({});
    await prisma.pipeline.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.equipeMembro.deleteMany({});
    await prisma.equipe.deleteMany({});
  });

  async function backdateLead(leadId: string, quando: Date) {
    await prisma.lead.update({ where: { id: leadId }, data: { criadoEm: quando } });
  }

  async function moverGanha(oppId: string, ganhaId: string, quando: Date) {
    const r = await http()
      .post(`/crm/oportunidades/${oppId}/mover`)
      .set(ADMIN)
      .send({ etapaId: ganhaId });
    if (r.status >= 300) throw new Error(`mover falhou ${r.status}: ${JSON.stringify(r.body)}`);
    // A movimentação nasce com `criadoEm = now`; recua para dentro da janela.
    await prisma.oportunidadeMovimentacao.updateMany({
      where: { oportunidadeId: oppId },
      data: { criadoEm: quando },
    });
    await prisma.oportunidade.update({ where: { id: oppId }, data: { criadoEm: quando } });
  }

  // ------------------------------------------------------------------ US1
  describe('US1 — visão geral + comparação período-a-período', () => {
    it('monta o dashboard e compara com o período anterior de igual duração', async () => {
      const pessoaId = await h.criarPessoa();
      const { pipelineId, ganha } = await h.criarPipelineCompleto();

      // 2 leads no período, 1 no período anterior
      const l1 = await h.criarLead();
      const l2 = await h.criarLead();
      const l0 = await h.criarLead();
      await backdateLead(l1, dentro);
      await backdateLead(l2, dentro);
      await backdateLead(l0, antes);

      // 1 oportunidade criada e ganha no período
      const o = await h.criarOportunidade(pipelineId, { pessoaId });
      await moverGanha(o.body.id, ganha, dentro);

      const res = await http().get(`/crm/dashboard?de=${DE}&ate=${ATE}`).set(ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.periodo.duracaoDias).toBe(31);
      // período anterior = 31 dias imediatamente antes de 2026-08-01
      expect(res.body.periodo.anteriorDe.slice(0, 10)).toBe('2026-07-01');
      expect(res.body.periodo.anteriorAte.slice(0, 10)).toBe('2026-07-31');

      const vg = res.body.paineis.find((p: { id: string }) => p.id === 'visao_geral');
      expect(vg.dados.leadsNovos.valor).toBe(2);
      expect(vg.dados.leadsNovos.periodoAnterior).toBe(1);
      expect(vg.dados.leadsNovos.delta).toBe(1);
      expect(vg.dados.oportunidadesGanhas.valor).toBe(1);
      expect(vg.dados.taxaConversao).toBe(1);
    });

    it('de > ate → 400', async () => {
      const res = await http().get(`/crm/dashboard?de=${ATE}&ate=${DE}`).set(ADMIN);
      expect(res.status).toBe(400);
    });

    it('data inválida → 400', async () => {
      const res = await http().get('/crm/dashboard?de=ontem&ate=2026-08-31').set(ADMIN);
      expect(res.status).toBe(400);
    });

    it('sujeito só com dashboard:ver → 200 com painéis restritos (nunca 403 na página)', async () => {
      const { token } = await h.sujeitoCom(['dashboard:ver']);
      const res = await http()
        .get(`/crm/dashboard?de=${DE}&ate=${ATE}`)
        .set({ Authorization: `Bearer ${token}` });
      expect(res.status).toBe(200);
      const ids = res.body.paineis.map((p: { id: string }) => p.id);
      expect(ids).toEqual(['visao_geral']);
      // visão geral zerada — o sujeito não enxerga leads/oportunidades
      const vg = res.body.paineis[0];
      expect(vg.dados.leadsNovos.valor).toBe(0);
    });

    it('sem dashboard:ver → 403', async () => {
      const { token } = await h.sujeitoCom([]);
      const res = await http()
        .get(`/crm/dashboard?de=${DE}&ate=${ATE}`)
        .set({ Authorization: `Bearer ${token}` });
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------ US2
  describe('US2 — funil e ranking', () => {
    it('funil por etapa (qtd + valor por moeda) e ranking por responsável', async () => {
      const pessoaId = await h.criarPessoa();
      const { pipelineId, ganha } = await h.criarPipelineCompleto();

      const o1 = await h.criarOportunidade(pipelineId, { pessoaId }, {
        valorEstimado: { valorInt: '3000000000', moeda: 'BRL' },
      });
      const o2 = await h.criarOportunidade(pipelineId, { pessoaId }, {
        valorEstimado: { valorInt: '1000000000', moeda: 'BRL' },
      });
      await moverGanha(o1.body.id, ganha, dentro);
      await moverGanha(o2.body.id, ganha, dentro);

      const funil = await http()
        .get(`/crm/dashboard/paineis/funil_pipeline?de=${DE}&ate=${ATE}&pipelineId=${pipelineId}`)
        .set(ADMIN);
      expect(funil.status).toBe(200);
      const etapaGanha = funil.body.dados.porEtapa.find(
        (e: { tipo: string }) => e.tipo === 'GANHA',
      );
      expect(etapaGanha.quantidade).toBe(2);
      expect(etapaGanha.valorEstimado).toEqual([
        { moeda: 'BRL', valorInt: '4000000000' },
      ]);

      const ranking = await http()
        .get(`/crm/dashboard/paineis/ranking_comercial?de=${DE}&ate=${ATE}`)
        .set(ADMIN);
      expect(ranking.status).toBe(200);
      // credencial de serviço não é responsável de nenhuma oportunidade →
      // ranking pode estar vazio, mas o shape é estável
      expect(Array.isArray(ranking.body.dados.itens)).toBe(true);
    });

    it('ranking_comercial não aparece para quem só tem oportunidade:ver_proprias', async () => {
      const { token } = await h.sujeitoCom(['dashboard:ver', 'oportunidade:ver_proprias']);
      const cat = await http()
        .get('/crm/dashboard/paineis')
        .set({ Authorization: `Bearer ${token}` });
      const ranking = cat.body.paineis.find((p: { id: string }) => p.id === 'ranking_comercial');
      const funil = cat.body.paineis.find((p: { id: string }) => p.id === 'funil_pipeline');
      expect(ranking.visivel).toBe(false);
      expect(funil.visivel).toBe(true);

      const res = await http()
        .get(`/crm/dashboard/paineis/ranking_comercial?de=${DE}&ate=${ATE}`)
        .set({ Authorization: `Bearer ${token}` });
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------ US3
  describe('US3 — qualidade de atendimento', () => {
    it('tempo médio de 1ª resposta, % SLA, CSAT e taxa de resolução', async () => {
      const pessoaId = await h.criarPessoa();
      const uid = await h.criarUsuario('Atendente');
      const base = new Date('2026-08-10T12:00:00Z');

      const mkAtd = async (respostaMin: number, encerrado: boolean) =>
        prisma.atendimento.create({
          data: {
            id: randomUUID(),
            pessoaId,
            canal: 'WHATSAPP',
            atendenteAtualId: uid,
            status: encerrado ? 'ENCERRADO' : 'EM_ATENDIMENTO',
            abertoEm: base,
            primeiraRespostaEm: new Date(base.getTime() + respostaMin * 60_000),
            slaMinutos: 30,
            encerradoEm: encerrado ? new Date(base.getTime() + 3_600_000) : null,
          },
        });

      const a1 = await mkAtd(10, true); // dentro do SLA, encerrado
      await mkAtd(60, false); // fora do SLA, aberto

      // 1 nota de CSAT (interacao NPS ligada ao atendimento encerrado)
      await prisma.interacao.create({
        data: {
          id: randomUUID(),
          pessoaId,
          tipo: 'NPS',
          conteudo: '9',
          notaNps: 9,
          atendimentoId: a1.id,
          ocorridoEm: new Date(base.getTime() + 4_000_000),
        },
      });

      const res = await http()
        .get(`/crm/dashboard/paineis/qualidade_atendimento?de=${DE}&ate=${ATE}`)
        .set(ADMIN);
      expect(res.status).toBe(200);
      const d = res.body.dados;
      expect(d.tempoMedioPrimeiraRespostaMinutos.valor).toBeCloseTo(35);
      expect(d.percentualDentroSla).toBeCloseTo(0.5);
      expect(d.csatMedio).toBeCloseTo(9);
      expect(d.distribuicaoCsat['9']).toBe(1);
      expect(d.taxaResolucao).toBeCloseTo(0.5);
    });
  });

  // ------------------------------------------------------------------ US4
  describe('US4 — metas comerciais e alerta de atingimento', () => {
    it('meta de contagem: realizado e status derivados; audita a criação', async () => {
      const pessoaId = await h.criarPessoa();
      const { pipelineId, ganha } = await h.criarPipelineCompleto();
      const o = await h.criarOportunidade(pipelineId, { pessoaId });
      await moverGanha(o.body.id, ganha, dentro);

      const criar = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'oportunidades_ganhas',
        periodo: 'MES',
        referencia: '2026-08-10',
        alvo: { valor: 10 },
      });
      expect(criar.status).toBe(201);
      expect(criar.body.referencia).toBe('2026-08-01'); // normalizada
      expect(criar.body.realizado).toEqual({ valor: 1 });
      expect(criar.body.percentual).toBeCloseTo(0.1);

      const auditou = await prisma.crmDashboardAudit.count({
        where: { entidade: 'meta_comercial', motivo: 'criar' },
      });
      expect(auditou).toBe(1);
    });

    it('meta do período corrente em risco aparece em /crm/dashboard/notificacoes', async () => {
      // referência = hoje → período (mês) corrente; alvo alto e 0 realizado com
      // parte do mês decorrida ⇒ status em_risco ⇒ entra em /notificacoes.
      const hoje = new Date().toISOString().slice(0, 10);
      const criar = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'oportunidades_ganhas',
        periodo: 'MES',
        referencia: hoje,
        alvo: { valor: 1000 },
      });
      expect(criar.status).toBe(201);

      const notif = await http().get('/crm/dashboard/notificacoes').set(ADMIN);
      expect(notif.status).toBe(200);
      const item = notif.body.itens.find(
        (x: { metaId: string }) => x.metaId === criar.body.id,
      );
      expect(item).toBeDefined();
      expect(['em_risco', 'batida', 'estourada']).toContain(item.status);
    });

    it('meta monetária exige moeda; contagem rejeita moeda; métrica fora do catálogo → 422', async () => {
      const semMoeda = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'valor_ganho',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valor: 100 },
      });
      expect(semMoeda.status).toBe(422);

      const contagemComMoeda = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'leads_novos',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valorInt: '100', moeda: 'BRL' },
      });
      expect(contagemComMoeda.status).toBe(422);

      const foraDoCatalogo = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'inventada',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valor: 1 },
      });
      expect(foraDoCatalogo.status).toBe(422);
    });

    it('responsável/equipe inexistente → 422', async () => {
      const res = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'leads_novos',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valor: 1 },
        responsavelId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(422);
    });

    it('sem dashboard:gerir_metas → 403 na escrita, 200 na leitura', async () => {
      const { token } = await h.sujeitoCom(['dashboard:ver']);
      const bearer = { Authorization: `Bearer ${token}` };

      const criar = await http().post('/crm/dashboard/metas').set(bearer).send({
        metrica: 'leads_novos',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valor: 5 },
      });
      expect(criar.status).toBe(403);

      const ler = await http().get('/crm/dashboard/metas').set(bearer);
      expect(ler.status).toBe(200);
    });

    it('DELETE remove a meta e audita', async () => {
      const criar = await http().post('/crm/dashboard/metas').set(ADMIN).send({
        metrica: 'leads_novos',
        periodo: 'MES',
        referencia: '2026-08-01',
        alvo: { valor: 5 },
      });
      const id = criar.body.id as string;
      const del = await http().delete(`/crm/dashboard/metas/${id}`).set(ADMIN);
      expect(del.status).toBe(204);
      expect(await prisma.metaComercial.count({ where: { id } })).toBe(0);
      expect(
        await prisma.crmDashboardAudit.count({
          where: { entidade: 'meta_comercial', entidadeId: id, motivo: 'remover' },
        }),
      ).toBe(1);
    });
  });

  // ------------------------------------------------------------------ US5
  describe('US5 — visões salvas e export', () => {
    it('salva, reidrata idêntica; compartilha com perfil → outro sujeito vê somente-leitura e clona', async () => {
      const criar = await http().post('/crm/dashboard/visoes').set(ADMIN).send({
        nome: 'Comercial 30d',
        filtros: { periodo: { tipo: 'relativo', dias: 30 } },
        paineis: ['visao_geral', 'funil_pipeline'],
      });
      // a credencial de serviço não é um Usuario real → 400
      expect(criar.status).toBe(400);

      // Um perfil compartilhado por 2 usuários.
      const perfil = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: `p-visao-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, permissoes: ['dashboard:ver'] });
      const u1 = await h.criarUsuario('Visão Dono');
      const u2 = await h.criarUsuario('Visão Outro');
      for (const uid of [u1, u2]) {
        await http()
          .put(`/admin/rbac/usuarios/${uid}/perfis`)
          .set(ADMIN)
          .send({ perfilIds: [perfil.body.id] });
      }
      const bearer = { Authorization: `Bearer ${issueUserToken(u1)}` };
      const bearer2 = { Authorization: `Bearer ${issueUserToken(u2)}` };

      const salva = await http().post('/crm/dashboard/visoes').set(bearer).send({
        nome: 'Minha visão',
        filtros: { periodo: { tipo: 'relativo', dias: 7 } },
        paineis: ['visao_geral'],
        perfilCompartilhadoId: perfil.body.id,
      });
      expect(salva.status).toBe(201);

      const listaDono = await http().get('/crm/dashboard/visoes').set(bearer);
      const v = listaDono.body.itens.find((x: { id: string }) => x.id === salva.body.id);
      expect(v.dono).toBe(true);
      expect(v.paineis).toEqual(['visao_geral']);

      const listaOutro = await http().get('/crm/dashboard/visoes').set(bearer2);
      const compartilhada = listaOutro.body.itens.find(
        (x: { id: string }) => x.id === salva.body.id,
      );
      expect(compartilhada.somenteLeitura).toBe(true);

      // outro não pode editar/excluir
      const edit = await http()
        .patch(`/crm/dashboard/visoes/${salva.body.id}`)
        .set(bearer2)
        .send({ nome: 'hack' });
      expect(edit.status).toBe(403);

      // mas pode clonar
      const clone = await http()
        .post(`/crm/dashboard/visoes/${salva.body.id}/clonar`)
        .set(bearer2);
      expect(clone.status).toBe(201);
      expect(clone.body.nome).toContain('(cópia)');
      expect(clone.body.dono).toBe(true);
      expect(clone.body.perfilCompartilhadoId).toBeNull();
    });

    it('?formato=csv em painel tabular → text/csv; em funil → 400', async () => {
      const csv = await http()
        .get(`/crm/dashboard/paineis/leads_por_origem?de=${DE}&ate=${ATE}&formato=csv`)
        .set(ADMIN);
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\r\n')[0]).toBe('origem,leads,convertidos,taxaConversao');

      const naoTabular = await http()
        .get(`/crm/dashboard/paineis/funil_pipeline?de=${DE}&ate=${ATE}&formato=csv`)
        .set(ADMIN);
      expect(naoTabular.status).toBe(400);
    });
  });

  // -------------------------------------------------------------- fronteira
  describe('fronteira do bounded context', () => {
    it('nenhum arquivo de dashboard importa src/clientes/**', () => {
      const dir = join(__dirname, '../src/crm');
      const arquivos = [
        'domain/dashboard/paineis.ts',
        'domain/dashboard/periodo.ts',
        'domain/dashboard/meta.ts',
        'application/dashboard/dashboard.service.ts',
        'application/dashboard/paineis.service.ts',
        'application/dashboard/meta.service.ts',
        'application/dashboard/visao.service.ts',
        'infra/dashboard/metrica.repository.ts',
        'dashboard.controller.ts',
      ];
      for (const rel of arquivos) {
        const src = readFileSync(join(dir, rel), 'utf8');
        expect(src).not.toMatch(/from ['"].*clientes\//);
      }
    });

    it('o schema não tem tabela de rollup/métrica materializada', () => {
      const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');
      expect(schema).not.toMatch(/model \w*(Rollup|MetricaMaterializada|DashboardMetrica)\b/);
    });
  });
});
