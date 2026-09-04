import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GRAPH_API_CLIENT } from '../src/crm/application/whatsapp';
import { authHeader } from './support/auth';
import { crmAtendimentoHelpers } from './support/crm-atendimento';
import { criarGraphApiDublê, crmWhatsappHelpers, waIdDe, type GraphApiDublê } from './support/crm-whatsapp';

/**
 * spec 012 — Chat ao Vivo (e2e, Postgres real). Fila/endereçamento por carga
 * (CL-01, US1), SLA de 1ª resposta sempre derivado (US2), transferência
 * preservando a timeline (US3), CSAT via `interacao` tipo NPS (US4),
 * resposta automática fora do expediente (US5), guard 401/403/2xx, catálogo
 * +6, regressão `context-modules.e2e-spec.ts` (11 contextos).
 */
describe('crm — Chat ao Vivo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmAtendimentoHelpers>;
  let wh: ReturnType<typeof crmWhatsappHelpers>;
  let dublê: GraphApiDublê;
  const ADMIN = authHeader();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    dublê = criarGraphApiDublê();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_API_CLIENT)
      .useValue(dublê)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmAtendimentoHelpers(app);
    wh = crmWhatsappHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    dublê.falharProximoEnvio = null;
    dublê.proximoWaMessageId = '';
    dublê.chamadasEnviar = [];
    await prisma.respostaAtendimento.deleteMany({});
    await prisma.transferenciaAtendimento.deleteMany({});
    await prisma.atendimento.deleteMany({});
    await prisma.crmAdminAudit.deleteMany({});
    await prisma.interacao.deleteMany({});
    await prisma.eventoWebhookWhatsapp.deleteMany({});
    await prisma.canalWhatsapp.deleteMany({});
    await prisma.equipeMembro.deleteMany({});
    await prisma.janelaAtendimento.deleteMany({});
    await prisma.equipe.deleteMany({ where: { tipo: 'ATENDIMENTO' } });
  });

  async function tokenAtender() {
    return h.tokenComPermissoes(['atendimento:atender', 'atendimento:ver_todos', 'atendimento:transferir', 'atendimento:encerrar']);
  }

  // --------------------------------------------------------------- criação / reuso

  describe('criação e reuso (FR-001/FR-002)', () => {
    it('cria atendimento MANUAL e aparece na fila (AGUARDANDO — nenhuma equipe ATENDIMENTO existe)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const res = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      expect(res.status).toBe(201);
      expect(res.body.criado).toBe(true);

      const lista = await http().get('/crm/atendimentos').set(ADMIN);
      expect(lista.status).toBe(200);
      const item = lista.body.itens.find((i: { id: string }) => i.id === res.body.atendimentoId);
      expect(item).toBeDefined();
      expect(item.status).toBe('AGUARDANDO');
      expect(item.atendenteAtualId).toBeNull();
    });

    it('2ª chamada para a mesma pessoa reaproveita o atendimento aberto, não cria outro', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const r1 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const r2 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      expect(r2.body.criado).toBe(false);
      expect(r2.body.atendimentoId).toBe(r1.body.atendimentoId);
    });
  });

  // --------------------------------------------------------------- endereçamento (US1, CL-01)

  describe('endereçamento por carga/disponibilidade (US1, CL-01)', () => {
    it('escolhe o atendente com menor carga atual entre os disponíveis em expediente', async () => {
      const equipeId = await h.criarEquipeAtendimento();
      const a = await h.tokenComPermissoes(['atendimento:atender', 'atendimento:ver_todos']);
      const b = await h.tokenComPermissoes(['atendimento:atender', 'atendimento:ver_todos']);
      await h.adicionarMembro(equipeId, a.usuarioId);
      await h.adicionarMembro(equipeId, b.usuarioId);

      // A assume um 1º atendimento — carga(A) = 1.
      const pessoa1 = await h.criarPessoaComTelefone(h.numeroUnico());
      const at1 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId: pessoa1 });
      await http().post(`/crm/atendimentos/${at1.body.atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });

      // Novo atendimento entra na fila — B tem carga 0 < carga(A) = 1 → B é escolhido.
      const pessoa2 = await h.criarPessoaComTelefone(h.numeroUnico());
      const at2 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId: pessoa2 });
      const detalhe = await http().get(`/crm/atendimentos/${at2.body.atendimentoId}`).set(ADMIN);
      expect(detalhe.body.atendenteAtualId).toBe(b.usuarioId);
      expect(detalhe.body.status).toBe('EM_ATENDIMENTO');
    });

    it('sem ninguém em expediente (equipe sem janela) fica em AGUARDANDO sem atendente (FR-005)', async () => {
      // Equipe ATENDIMENTO sem nenhuma janela cadastrada — nunca em expediente.
      const res = await http().post('/crm/admin/equipes').set(ADMIN).send({ nome: 'Fechada', tipo: 'ATENDIMENTO' });
      const equipeId = res.body.id as string;
      const membro = await h.tokenComPermissoes(['atendimento:atender']);
      await h.adicionarMembro(equipeId, membro.usuarioId);

      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const detalhe = await http().get(`/crm/atendimentos/${at.body.atendimentoId}`).set(ADMIN);
      expect(detalhe.body.status).toBe('AGUARDANDO');
      expect(detalhe.body.atendenteAtualId).toBeNull();
    });
  });

  // --------------------------------------------------------------- SLA (US2, D-R3)

  describe('SLA de 1ª resposta sempre derivado (US2)', () => {
    it('estourado quando não há resposta e o prazo já passou; some ao responder', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;

      const atendente = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${atendente.token}` });

      // Backdata abertoEm e reduz o SLA — sem depender de esperar tempo real.
      await prisma.atendimento.update({
        where: { id: atendimentoId },
        data: { abertoEm: new Date(Date.now() - 60 * 60 * 1000), slaMinutos: 1 },
      });

      const antes = await http().get(`/crm/atendimentos/${atendimentoId}`).set(ADMIN);
      expect(antes.body.sla.estourado).toBe(true);
      expect(antes.body.sla.minutosRestantes).toBeNull();

      const resp = await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${atendente.token}` })
        .send({ conteudo: 'Oi! Já te respondo.' });
      expect(resp.status).toBe(201);
      expect(resp.body.primeiraResposta).toBe(true);

      const depois = await http().get(`/crm/atendimentos/${atendimentoId}`).set(ADMIN);
      expect(depois.body.sla.estourado).toBe(false);
      expect(depois.body.primeiraRespostaEm).not.toBeNull();
    });

    it('responder sem ser o atendente atual → 403', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const a = await tokenAtender();
      const b = await tokenAtender();
      await http().post(`/crm/atendimentos/${at.body.atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });

      const r = await http()
        .post(`/crm/atendimentos/${at.body.atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${b.token}` })
        .send({ conteudo: 'oi' });
      expect(r.status).toBe(403);
    });

    it('responder um atendimento ainda AGUARDANDO → 409', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const a = await tokenAtender();
      const r = await http()
        .post(`/crm/atendimentos/${at.body.atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ conteudo: 'oi' });
      expect(r.status).toBe(409);
    });

    it('registra RespostaAtendimento com atendenteId e viaIa (FR-012/FR-013)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });
      await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ conteudo: 'resposta assistida por IA', viaIa: true });

      const linha = await prisma.respostaAtendimento.findFirst({ where: { atendimentoId } });
      expect(linha?.atendenteId).toBe(a.usuarioId);
      expect(linha?.viaIa).toBe(true);
    });
  });

  // --------------------------------------------------------------- transferência (US3)

  describe('transferência preserva a timeline (US3)', () => {
    it('transfere para um atendente específico sem tocar a timeline', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      const b = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });
      await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ conteudo: 'mensagem antes da transferência' });

      const antes = await http().get(`/crm/atendimentos/${atendimentoId}/timeline`).set(ADMIN);

      const transf = await http()
        .post(`/crm/atendimentos/${atendimentoId}/transferir`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ paraAtendenteId: b.usuarioId, motivo: 'especialista' });
      expect(transf.status).toBe(201);
      expect(transf.body.atendimento.atendenteAtualId).toBe(b.usuarioId);
      expect(transf.body.atendimento.status).toBe('EM_ATENDIMENTO');

      const depois = await http().get(`/crm/atendimentos/${atendimentoId}/timeline`).set(ADMIN);
      expect(depois.body.itens).toEqual(antes.body.itens);

      const hist = await http().get(`/crm/atendimentos/${atendimentoId}/transferencias`).set(ADMIN);
      expect(hist.body.itens).toHaveLength(1);
      expect(hist.body.itens[0]).toMatchObject({ deAtendenteId: a.usuarioId, paraAtendenteId: b.usuarioId, motivo: 'especialista' });
    });

    it('transfere para equipe sem membro disponível → volta para AGUARDANDO (FR-009)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });

      const equipeVazia = await http().post('/crm/admin/equipes').set(ADMIN).send({ nome: 'Vazia', tipo: 'ATENDIMENTO' });

      const transf = await http()
        .post(`/crm/atendimentos/${atendimentoId}/transferir`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ paraEquipeId: equipeVazia.body.id });
      expect(transf.status).toBe(201);
      expect(transf.body.atendimento.atendenteAtualId).toBeNull();
      expect(transf.body.atendimento.status).toBe('AGUARDANDO');
    });

    it('transferir atendimento já encerrado → 409', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      const b = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });
      await http().post(`/crm/atendimentos/${atendimentoId}/encerrar`).set({ Authorization: `Bearer ${a.token}` }).send({});

      const transf = await http()
        .post(`/crm/atendimentos/${atendimentoId}/transferir`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ paraAtendenteId: b.usuarioId });
      expect(transf.status).toBe(409);
    });
  });

  // --------------------------------------------------------------- encerrar + CSAT (US4)

  describe('encerrar e CSAT (US4)', () => {
    it('encerra, marca csatSolicitadoEm, registra 1 nota e recusa a 2ª (SC-004)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });

      const encerrar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/encerrar`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ motivo: 'resolvido' });
      expect(encerrar.status).toBe(201);
      expect(encerrar.body.status).toBe('ENCERRADO');
      expect(encerrar.body.csatSolicitadoEm).not.toBeNull();

      const csat1 = await http()
        .post(`/crm/atendimentos/${atendimentoId}/csat`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ nota: 9, comentario: 'ótimo' });
      expect(csat1.status).toBe(201);

      const timeline = await http().get(`/crm/atendimentos/${atendimentoId}/timeline`).set(ADMIN);
      const nps = timeline.body.itens.find((i: { tipo: string }) => i.tipo === 'NPS');
      expect(nps?.notaNps).toBe(9);

      const csat2 = await http()
        .post(`/crm/atendimentos/${atendimentoId}/csat`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ nota: 5 });
      expect(csat2.status).toBe(409);
      expect(csat2.body.erro).toBe('csat_ja_registrado');
    });

    it('CSAT antes de encerrar → 409 nao_elegivel_para_csat', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const atendimentoId = at.body.atendimentoId as string;
      const a = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });
      const r = await http()
        .post(`/crm/atendimentos/${atendimentoId}/csat`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({ nota: 8 });
      expect(r.status).toBe(409);
      expect(r.body.erro).toBe('nao_elegivel_para_csat');
    });

    it('encerrar um atendimento que não está EM_ATENDIMENTO → 409', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const at = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
      const a = await tokenAtender();
      const r = await http()
        .post(`/crm/atendimentos/${at.body.atendimentoId}/encerrar`)
        .set({ Authorization: `Bearer ${a.token}` })
        .send({});
      expect(r.status).toBe(409);
    });
  });

  // ------------------------------------------------------- WhatsApp: fila + resposta automática + CSAT (US1/US5)

  describe('integração com WhatsApp — abre fila, resposta automática, CSAT (US1/US5)', () => {
    it('mensagem de entrada abre um atendimento e agrupa a timeline sob ele', async () => {
      const canal = await wh.criarCanal();
      const telefone = h.numeroUnico();
      const payload = wh.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: `wamid.${Date.now()}`,
        texto: 'Oi, preciso de ajuda',
        nomeContato: 'Cliente Novo',
      });
      const r = await wh.postWebhook(payload, canal.appSecret);
      expect(r.status).toBe(200);

      const lista = await http().get('/crm/atendimentos').set(ADMIN);
      expect(lista.body.itens.length).toBeGreaterThan(0);
      const atendimento = lista.body.itens.find((i: { canal: string }) => i.canal === 'WHATSAPP');
      expect(atendimento).toBeDefined();

      const timeline = await http().get(`/crm/atendimentos/${atendimento.id}/timeline`).set(ADMIN);
      expect(timeline.body.itens).toHaveLength(1);
      expect(timeline.body.itens[0].conteudo).toBe('Oi, preciso de ajuda');
    });

    it('fora do expediente, dispara a resposta automática 1× e não conta como 1ª resposta (D-R6)', async () => {
      const equipeFechada = await http().post('/crm/admin/equipes').set(ADMIN).send({ nome: 'Fechada WA', tipo: 'ATENDIMENTO' });
      await http()
        .patch(`/crm/admin/atendimento/equipes/${equipeFechada.body.id}`)
        .set(ADMIN)
        .send({ mensagemForaExpediente: 'Voltamos às 9h!' });

      const canal = await wh.criarCanal();
      const telefone = h.numeroUnico();
      const payload1 = wh.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: `wamid.${Date.now()}-1`,
        texto: 'Alguém aí?',
      });
      await wh.postWebhook(payload1, canal.appSecret);
      expect(dublê.chamadasEnviar).toHaveLength(1);
      expect(dublê.chamadasEnviar[0].corpo).toMatchObject({ tipo: 'texto', texto: 'Voltamos às 9h!' });

      const lista = await http().get('/crm/atendimentos').set(ADMIN);
      const atendimento = lista.body.itens.find((i: { canal: string }) => i.canal === 'WHATSAPP');
      expect(atendimento.primeiraRespostaEm).toBeNull();

      const payload2 = wh.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: `wamid.${Date.now()}-2`,
        texto: 'Ainda esperando',
      });
      await wh.postWebhook(payload2, canal.appSecret);
      expect(dublê.chamadasEnviar).toHaveLength(1); // não repete (D-R6)
    });

    it('resposta numérica após encerramento elegível vira CSAT, não uma interação comum (FR-016)', async () => {
      const canal = await wh.criarCanal();
      const telefone = h.numeroUnico();
      const idMsg1 = `wamid.${Date.now()}-a`;
      await wh.postWebhook(
        wh.payloadMensagemTexto({ phoneNumberId: canal.phoneNumberId, de: waIdDe(telefone), idMensagem: idMsg1, texto: 'oi' }),
        canal.appSecret,
      );
      const lista = await http().get('/crm/atendimentos').set(ADMIN);
      const atendimento = lista.body.itens.find((i: { canal: string }) => i.canal === 'WHATSAPP');
      const a = await tokenAtender();
      await http().post(`/crm/atendimentos/${atendimento.id}/assumir`).set({ Authorization: `Bearer ${a.token}` });
      await http().post(`/crm/atendimentos/${atendimento.id}/encerrar`).set({ Authorization: `Bearer ${a.token}` }).send({});

      const idMsg2 = `wamid.${Date.now()}-b`;
      const r = await wh.postWebhook(
        wh.payloadMensagemTexto({ phoneNumberId: canal.phoneNumberId, de: waIdDe(telefone), idMensagem: idMsg2, texto: '9' }),
        canal.appSecret,
      );
      expect(r.status).toBe(200);

      const timeline = await http().get(`/crm/atendimentos/${atendimento.id}/timeline`).set(ADMIN);
      const nps = timeline.body.itens.find((i: { tipo: string }) => i.tipo === 'NPS');
      expect(nps?.notaNps).toBe(9);
    });
  });

  // --------------------------------------------------------------- configuração administrativa

  describe('configuração administrativa por equipe (FR-021)', () => {
    it('PATCH configura SLA e mensagem fora do expediente; audita em crm_admin_audit', async () => {
      const equipeId = await h.criarEquipeAtendimento();
      const r = await http()
        .patch(`/crm/admin/atendimento/equipes/${equipeId}`)
        .set(ADMIN)
        .send({ slaPrimeiraRespostaMinutos: 15, mensagemForaExpediente: 'Voltamos já!' });
      expect(r.status).toBe(200);
      expect(r.body.slaPrimeiraRespostaMinutos).toBe(15);
      expect(r.body.mensagemForaExpediente).toBe('Voltamos já!');

      const audit = await prisma.crmAdminAudit.findMany({ where: { entidadeId: equipeId } });
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    it('equipe que não é ATENDIMENTO → 422', async () => {
      const res = await http().post('/crm/admin/equipes').set(ADMIN).send({ nome: 'Comercial', tipo: 'COMERCIAL' });
      const r = await http()
        .patch(`/crm/admin/atendimento/equipes/${res.body.id}`)
        .set(ADMIN)
        .send({ slaPrimeiraRespostaMinutos: 10 });
      expect(r.status).toBe(422);
      expect(r.body.erro).toBe('equipe_nao_e_de_atendimento');
      await prisma.equipe.delete({ where: { id: res.body.id } });
    });
  });

  // --------------------------------------------------------------- guard, escopo, catálogo, regressão

  describe('guard, escopo e catálogo', () => {
    it('rota autenticada sem token → 401', async () => {
      const r = await http().get('/crm/atendimentos');
      expect(r.status).toBe(401);
    });

    it('sem permissão → 403', async () => {
      const semPerm = await h.tokenComPermissoes([]);
      const r = await http().get('/crm/atendimentos').set({ Authorization: `Bearer ${semPerm.token}` });
      expect(r.status).toBe(403);
    });

    it('ver_proprios só enxerga os próprios atendimentos (FR-019)', async () => {
      const pessoa1 = await h.criarPessoaComTelefone(h.numeroUnico());
      const pessoa2 = await h.criarPessoaComTelefone(h.numeroUnico());
      const at1 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId: pessoa1 });
      const at2 = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId: pessoa2 });

      const a = await h.tokenComPermissoes(['atendimento:atender', 'atendimento:ver_proprios']);
      await http().post(`/crm/atendimentos/${at1.body.atendimentoId}/assumir`).set({ Authorization: `Bearer ${a.token}` });

      const lista = await http().get('/crm/atendimentos').set({ Authorization: `Bearer ${a.token}` });
      const ids = lista.body.itens.map((i: { id: string }) => i.id);
      expect(ids).toContain(at1.body.atendimentoId);
      expect(ids).not.toContain(at2.body.atendimentoId);

      const outroDetalhe = await http()
        .get(`/crm/atendimentos/${at2.body.atendimentoId}`)
        .set({ Authorization: `Bearer ${a.token}` });
      expect(outroDetalhe.status).toBe(404);
    });

    it('GET /admin/rbac/permissoes inclui as 6 novas', async () => {
      const r = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const ids = r.body.recursos.flatMap((g: { permissoes: { id: string }[] }) => g.permissoes.map((p) => p.id));
      expect(ids).toEqual(
        expect.arrayContaining([
          'atendimento:ver_todos',
          'atendimento:ver_proprios',
          'atendimento:atender',
          'atendimento:transferir',
          'atendimento:encerrar',
          'crm_admin:gerir_atendimento',
        ]),
      );
    });
  });
});
