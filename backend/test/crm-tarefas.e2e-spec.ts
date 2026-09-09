import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { crmPipelineHelpers } from './support/crm-pipeline';

/**
 * spec 016 — CRM · Tarefas (e2e, Postgres real). Checklist, cronômetro,
 * comentários append-only, dependência sem ciclos, delegação com histórico,
 * escopo `ver_todas`/`ver_proprias` (D-08 — geral inclusa), ranking de pontos
 * derivado (CL-01), notificações in-app (CL-02), ação `CRIAR_TAREFA` do
 * Workflow (CL-03), guard 401/403, catálogo +5, `CONTEXT_MODULES` = 11.
 */
describe('crm — Tarefas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmPipelineHelpers>;
  const ADMIN = authHeader();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmPipelineHelpers(app);

    // research.md D-R9 (herdado da 014): a 1ª passada só estabelece a linha
    // de partida do cursor de cada fonte — aquecimento antes de qualquer
    // cenário reativo de CRIAR_TAREFA.
    await http().post('/crm/workflow/processar').set(ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // `tarefa.{pessoa,lead,oportunidade}Id` são `onDelete: Restrict` — some
    // primeiro para não quebrar `pessoa.deleteMany({})`/etc. de outra suíte
    // (mesmo racional do `interacao.deleteMany` em crm-pipeline.e2e-spec.ts).
    await prisma.crmTarefaAudit.deleteMany({});
    await prisma.tarefa.deleteMany({});
    await prisma.execucaoFluxo.deleteMany({});
    await prisma.fluxoAutomacaoVersao.deleteMany({});
    await prisma.fluxoAutomacao.deleteMany({});
    await prisma.crmLeadAudit.deleteMany({});
    await prisma.oportunidadeMovimentacao.deleteMany({});
    await prisma.oportunidade.deleteMany({});
    await prisma.etapaPipeline.deleteMany({});
    await prisma.pipeline.deleteMany({});
    await prisma.lead.deleteMany({});
  });

  async function processar() {
    const res = await http().post('/crm/workflow/processar').set(ADMIN);
    if (res.status >= 300) throw new Error(`processar falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body as { execucoesCriadas: number };
  }

  async function criarTarefa(body: Record<string, unknown> = {}) {
    return http()
      .post('/crm/tarefas')
      .set(ADMIN)
      .send({ titulo: `Tarefa ${Math.random().toString(36).slice(2, 7)}`, ...body });
  }

  // ------------------------------------------------------------ US1: CRUD + checklist

  describe('US1 — gestão pessoal, checklist, status', () => {
    it('cria com checklist, marca item e conclui mesmo com checklist incompleto', async () => {
      const c = await criarTarefa({ checklist: ['Passo 1', 'Passo 2', 'Passo 3'] });
      expect(c.status).toBe(201);
      expect(c.body.status).toBe('PENDENTE');
      expect(c.body.progressoChecklist).toEqual({ concluidos: 0, total: 3 });

      const itemId = c.body.checklist[0].id as string;
      const marcado = await http()
        .patch(`/crm/tarefas/${c.body.id}/checklist/${itemId}`)
        .set(ADMIN)
        .send({ concluido: true });
      expect(marcado.status).toBe(200);

      const detalhe1 = await http().get(`/crm/tarefas/${c.body.id}`).set(ADMIN);
      expect(detalhe1.body.progressoChecklist).toEqual({ concluidos: 1, total: 3 });

      const concluir = await http()
        .post(`/crm/tarefas/${c.body.id}/status`)
        .set(ADMIN)
        .send({ status: 'CONCLUIDA' });
      expect(concluir.status).toBe(201);
      expect(concluir.body.status).toBe('CONCLUIDA');
      expect(concluir.body.concluidoEm).not.toBeNull();
    });

    it('tarefa terminal recusa edição e checklist (409), exceto reabrir', async () => {
      const c = await criarTarefa();
      await http().post(`/crm/tarefas/${c.body.id}/status`).set(ADMIN).send({ status: 'CONCLUIDA' });

      const editar = await http().patch(`/crm/tarefas/${c.body.id}`).set(ADMIN).send({ titulo: 'novo' });
      expect(editar.status).toBe(409);

      const item = await http().post(`/crm/tarefas/${c.body.id}/checklist`).set(ADMIN).send({ texto: 'x' });
      expect(item.status).toBe(409);

      const reabrir = await http()
        .post(`/crm/tarefas/${c.body.id}/status`)
        .set(ADMIN)
        .send({ status: 'PENDENTE' });
      expect(reabrir.status).toBe(201);
      expect(reabrir.body.status).toBe('PENDENTE');
      expect(reabrir.body.concluidoEm).toBeNull();
    });

    it('concluir uma CANCELADA é sempre 409 (terminal sem reabertura)', async () => {
      const c = await criarTarefa();
      await http().post(`/crm/tarefas/${c.body.id}/status`).set(ADMIN).send({ status: 'CANCELADA' });
      const r = await http().post(`/crm/tarefas/${c.body.id}/status`).set(ADMIN).send({ status: 'PENDENTE' });
      expect(r.status).toBe(409);
    });

    it('âncora inexistente → 404', async () => {
      const r = await criarTarefa({ pessoaId: '00000000-0000-7000-8000-000000000000' });
      expect(r.status).toBe(404);
    });

    it('escopo ver_proprias: não vaza tarefa de outro responsável, mas vê a geral', async () => {
      const userA = await h.sujeitoCom(['tarefa:ver_proprias', 'tarefa:criar']);
      const userB = await h.sujeitoCom(['tarefa:ver_proprias']);
      const daA = await criarTarefa({ responsavelId: userA.usuarioId });
      const geral = await criarTarefa({});

      const bComoA = await http().get(`/crm/tarefas/${daA.body.id}`).set(bearer(userB.token));
      expect(bComoA.status).toBe(404);

      const bComoGeral = await http().get(`/crm/tarefas/${geral.body.id}`).set(bearer(userB.token));
      expect(bComoGeral.status).toBe(200);

      const aComoA = await http().get(`/crm/tarefas/${daA.body.id}`).set(bearer(userA.token));
      expect(aComoA.status).toBe(200);
    });
  });

  // ------------------------------------------------------------ US2: cronômetro, notas, agenda

  describe('US2 — cronômetro, notas de acompanhamento, agenda', () => {
    it('inicia, recusa 2º início, para, recusa parar sem período aberto', async () => {
      const c = await criarTarefa();
      const iniciar1 = await http().post(`/crm/tarefas/${c.body.id}/cronometro/iniciar`).set(ADMIN);
      expect(iniciar1.status).toBe(201);
      expect(iniciar1.body.fim).toBeNull();

      const iniciar2 = await http().post(`/crm/tarefas/${c.body.id}/cronometro/iniciar`).set(ADMIN);
      expect(iniciar2.status).toBe(409);

      const parar1 = await http().post(`/crm/tarefas/${c.body.id}/cronometro/parar`).set(ADMIN);
      expect(parar1.status).toBe(201);
      expect(parar1.body.fim).not.toBeNull();

      const parar2 = await http().post(`/crm/tarefas/${c.body.id}/cronometro/parar`).set(ADMIN);
      expect(parar2.status).toBe(409);

      const obter = await http().get(`/crm/tarefas/${c.body.id}/cronometro`).set(ADMIN);
      expect(obter.body.tempoTotalSegundos).toBeGreaterThanOrEqual(0);
    });

    it('comentários são append-only e aparecem em ordem cronológica', async () => {
      const c = await criarTarefa();
      await http().post(`/crm/tarefas/${c.body.id}/notas`).set(ADMIN).send({ conteudo: 'primeiro' });
      await http().post(`/crm/tarefas/${c.body.id}/notas`).set(ADMIN).send({ conteudo: 'segundo' });

      const notas = await http().get(`/crm/tarefas/${c.body.id}/notas`).set(ADMIN);
      expect(notas.body.itens.map((n: { conteudo: string }) => n.conteudo)).toEqual([
        'primeiro',
        'segundo',
      ]);
    });

    it('agenda filtra por intervalo de vencimento', async () => {
      const dentro = await criarTarefa({ dataVencimento: '2027-01-10T12:00:00Z' });
      await criarTarefa({ dataVencimento: '2027-03-01T12:00:00Z' });

      const lista = await http()
        .get('/crm/tarefas')
        .query({ vencimentoDe: '2027-01-01T00:00:00Z', vencimentoAte: '2027-01-31T23:59:59Z' })
        .set(ADMIN);
      const ids = lista.body.itens.map((t: { id: string }) => t.id);
      expect(ids).toContain(dentro.body.id);
    });

    it('vencendoHoje/atrasada são derivados do dia civil, nunca de tarefa terminal', async () => {
      const ontem = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const atrasada = await criarTarefa({ dataVencimento: ontem });
      const detalhe = await http().get(`/crm/tarefas/${atrasada.body.id}`).set(ADMIN);
      expect(detalhe.body.atrasada).toBe(true);
      expect(detalhe.body.vencendoHoje).toBe(false);

      await http().post(`/crm/tarefas/${atrasada.body.id}/status`).set(ADMIN).send({ status: 'CANCELADA' });
      const detalhe2 = await http().get(`/crm/tarefas/${atrasada.body.id}`).set(ADMIN);
      expect(detalhe2.body.atrasada).toBe(false);
    });
  });

  // ------------------------------------------------------------ US3: dependência, delegação, geral

  describe('US3 — dependência entre tarefas, delegação, fila geral', () => {
    it('bloqueia conclusão com dependência pendente; libera quando ela é concluída', async () => {
      const t1 = await criarTarefa();
      const t2 = await criarTarefa();
      const dep = await http()
        .post(`/crm/tarefas/${t2.body.id}/dependencias`)
        .set(ADMIN)
        .send({ dependeDeId: t1.body.id });
      expect(dep.status).toBe(201);

      const bloqueado = await http()
        .post(`/crm/tarefas/${t2.body.id}/status`)
        .set(ADMIN)
        .send({ status: 'CONCLUIDA' });
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body.dependenciasPendentes).toEqual([{ id: t1.body.id, titulo: t1.body.titulo }]);

      await http().post(`/crm/tarefas/${t1.body.id}/status`).set(ADMIN).send({ status: 'CONCLUIDA' });
      const liberado = await http()
        .post(`/crm/tarefas/${t2.body.id}/status`)
        .set(ADMIN)
        .send({ status: 'CONCLUIDA' });
      expect(liberado.status).toBe(201);
    });

    it('recusa auto-dependência e ciclo indireto (422)', async () => {
      const a = await criarTarefa();
      const auto = await http()
        .post(`/crm/tarefas/${a.body.id}/dependencias`)
        .set(ADMIN)
        .send({ dependeDeId: a.body.id });
      expect(auto.status).toBe(422);

      const b = await criarTarefa();
      const cTarefa = await criarTarefa();
      await http().post(`/crm/tarefas/${a.body.id}/dependencias`).set(ADMIN).send({ dependeDeId: b.body.id });
      await http().post(`/crm/tarefas/${b.body.id}/dependencias`).set(ADMIN).send({ dependeDeId: cTarefa.body.id });
      const ciclo = await http()
        .post(`/crm/tarefas/${cTarefa.body.id}/dependencias`)
        .set(ADMIN)
        .send({ dependeDeId: a.body.id });
      expect(ciclo.status).toBe(422);
    });

    it('delega com histórico; repetir o mesmo responsável é no-op', async () => {
      const userA = await h.sujeitoCom([]);
      const userB = await h.sujeitoCom([]);
      const c = await criarTarefa({ responsavelId: userA.usuarioId });

      const delegar = await http()
        .post(`/crm/tarefas/${c.body.id}/delegar`)
        .set(ADMIN)
        .send({ responsavelId: userB.usuarioId, motivo: 'férias' });
      expect(delegar.status).toBe(201);
      expect(delegar.body.responsavelId).toBe(userB.usuarioId);

      const repetir = await http()
        .post(`/crm/tarefas/${c.body.id}/delegar`)
        .set(ADMIN)
        .send({ responsavelId: userB.usuarioId });
      expect(repetir.status).toBe(201);

      const historico = await http().get(`/crm/tarefas/${c.body.id}/delegacoes`).set(ADMIN);
      expect(historico.body.itens).toHaveLength(1);
      expect(historico.body.itens[0]).toMatchObject({
        deResponsavelId: userA.usuarioId,
        paraResponsavelId: userB.usuarioId,
        motivo: 'férias',
      });
    });

    it('tarefa geral (sem responsável) aparece para quem só tem ver_proprias', async () => {
      const geral = await criarTarefa({});
      const userB = await h.sujeitoCom(['tarefa:ver_proprias']);
      const lista = await http().get('/crm/tarefas').set(bearer(userB.token));
      expect(lista.body.itens.map((t: { id: string }) => t.id)).toContain(geral.body.id);
    });
  });

  // ------------------------------------------------------------ US4: pontos, notificações, workflow

  describe('US4 — ranking de pontos, notificações in-app, geração automática', () => {
    it('ranking soma pontos-base + bônus de prazo/checklist, derivado por período', async () => {
      const user = await h.sujeitoCom([]);
      const futuro = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const noPrazo = await criarTarefa({
        responsavelId: user.usuarioId,
        dataVencimento: futuro,
        checklist: ['a', 'b'],
      });
      const itemA = noPrazo.body.checklist[0].id as string;
      const itemB = noPrazo.body.checklist[1].id as string;
      await http().patch(`/crm/tarefas/${noPrazo.body.id}/checklist/${itemA}`).set(ADMIN).send({ concluido: true });
      await http().patch(`/crm/tarefas/${noPrazo.body.id}/checklist/${itemB}`).set(ADMIN).send({ concluido: true });
      await http().post(`/crm/tarefas/${noPrazo.body.id}/status`).set(ADMIN).send({ status: 'CONCLUIDA' });

      const passado = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const atrasada = await criarTarefa({ responsavelId: user.usuarioId, dataVencimento: passado });
      await http().post(`/crm/tarefas/${atrasada.body.id}/status`).set(ADMIN).send({ status: 'CONCLUIDA' });

      const ranking = await http().get('/crm/tarefas/ranking').set(ADMIN);
      const entrada = (ranking.body as { responsavelId: string; pontos: number; tarefasConcluidas: number }[]).find(
        (e) => e.responsavelId === user.usuarioId,
      );
      expect(entrada?.tarefasConcluidas).toBe(2);
      expect(entrada?.pontos).toBe(10 + 5 + 5 + 10); // base+prazo+checklist, e base
    });

    it('notificações trazem só as tarefas do próprio sujeito vencendo hoje/atrasadas', async () => {
      const user = await h.sujeitoCom(['tarefa:ver_proprias']);
      const ontem = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const minhaAtrasada = await criarTarefa({ responsavelId: user.usuarioId, dataVencimento: ontem });
      await criarTarefa({ responsavelId: user.usuarioId }); // sem prazo, não deve aparecer

      const notif = await http().get('/crm/tarefas/notificacoes').set(bearer(user.token));
      const ids = notif.body.itens.map((t: { id: string }) => t.id);
      expect(ids).toEqual([minhaAtrasada.body.id]);
    });

    it('notificações com a credencial de serviço (não é Usuario real) → lista vazia, nunca 500', async () => {
      const notif = await http().get('/crm/tarefas/notificacoes').set(ADMIN);
      expect(notif.status).toBe(200);
      expect(notif.body.itens).toEqual([]);
    });

    it('ação CRIAR_TAREFA do Workflow gera 1 tarefa por gatilho, idempotente sob reprocesso', async () => {
      const f = await http()
        .post('/crm/workflow/fluxos')
        .set(ADMIN)
        .send({ nome: `Fluxo tarefa ${Math.random().toString(36).slice(2, 7)}`, gatilhoTipo: 'LEAD_CRIADO' });
      await http()
        .put(`/crm/workflow/fluxos/${f.body.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'LEAD_CRIADO',
          condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
          acoes: [{ tipo: 'CRIAR_TAREFA', titulo: 'Follow-up automático', prazoDias: 2 }],
        });
      await http().post(`/crm/workflow/fluxos/${f.body.id}/publicar`).set(ADMIN);

      const leadId = await h.criarLead();
      const r1 = await processar();
      expect(r1.execucoesCriadas).toBe(1);

      const tarefas1 = await http().get('/crm/tarefas').query({ leadId }).set(ADMIN);
      expect(tarefas1.body.itens).toHaveLength(1);
      expect(tarefas1.body.itens[0].titulo).toBe('Follow-up automático');
      expect(tarefas1.body.itens[0].origem).toMatch(/^workflow:/);
      expect(tarefas1.body.itens[0].leadId).toBe(leadId);

      await processar(); // reprocessar não duplica (guard já existente da 014)
      const tarefas2 = await http().get('/crm/tarefas').query({ leadId }).set(ADMIN);
      expect(tarefas2.body.itens).toHaveLength(1);
    });

    it('ação CRIAR_TAREFA ancora em oportunidade quando o gatilho é OPORTUNIDADE_ETAPA_MUDOU', async () => {
      const { pipelineId } = await h.criarPipelineCompleto();

      const f = await http()
        .post('/crm/workflow/fluxos')
        .set(ADMIN)
        .send({ nome: `Fluxo op ${Math.random().toString(36).slice(2, 7)}`, gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU' });
      await http()
        .put(`/crm/workflow/fluxos/${f.body.id}/rascunho`)
        .set(ADMIN)
        .send({
          gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU',
          condicoes: { tipo: 'grupo', operador: 'E', itens: [] },
          acoes: [{ tipo: 'CRIAR_TAREFA', titulo: 'Comemorar venda' }],
        });
      await http().post(`/crm/workflow/fluxos/${f.body.id}/publicar`).set(ADMIN);

      // A 1ª movimentação (nascer na etapa ABERTA) já é o gatilho — mesmo
      // padrão de crm-workflow.e2e-spec.ts (research.md D-R9: o cursor só
      // varre movimentações que ocorrem depois do fluxo estar publicado).
      const leadId = await h.criarLead();
      const op = await h.criarOportunidade(pipelineId, { leadId });
      await processar();

      const tarefas = await http().get('/crm/tarefas').query({ oportunidadeId: op.body.id }).set(ADMIN);
      expect(tarefas.body.itens).toHaveLength(1);
      expect(tarefas.body.itens[0].titulo).toBe('Comemorar venda');
    });
  });

  // ------------------------------------------------------------ guard/catálogo/regressão

  describe('guard, catálogo e regressão', () => {
    it('401 sem token; 403 sem permissão; 2xx com credencial de serviço', async () => {
      const semToken = await http().get('/crm/tarefas');
      expect(semToken.status).toBe(401);

      const semPerm = await h.sujeitoCom([]);
      const r = await http().post('/crm/tarefas').set(bearer(semPerm.token)).send({ titulo: 'x' });
      expect(r.status).toBe(403);

      const ok = await http().get('/crm/tarefas').set(ADMIN);
      expect(ok.status).toBe(200);
    });

    it('catálogo ganha exatamente as 5 permissões novas', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const recursos = res.body.recursos as { recurso: string; permissoes: { id: string }[] }[];
      const ids = recursos.flatMap((g) => g.permissoes.map((p) => p.id));
      for (const id of [
        'tarefa:criar',
        'tarefa:editar',
        'tarefa:ver_todas',
        'tarefa:ver_proprias',
        'tarefa:delegar',
      ]) {
        expect(ids).toContain(id);
      }
    });

    it('/health continua afirmando 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.body.contexts).toHaveLength(11);
    });
  });
});
