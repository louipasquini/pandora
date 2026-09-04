import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GRAPH_API_CLIENT } from '../src/crm/application/whatsapp';
import { authHeader, issueTestToken } from './support/auth';
import {
  criarGraphApiDublê,
  crmWhatsappHelpers,
  numeroUnico,
  waIdDe,
  type GraphApiDublê,
} from './support/crm-whatsapp';

/**
 * spec 011 — Integração com WhatsApp (e2e, Postgres real). Canal/template
 * (US3), webhook de entrada com assinatura HMAC (US1), janela de 24h + envio
 * livre/template (US2), opt-out (US4), guard 401/403/2xx, catálogo +4,
 * regressão 003–010 coberta por `context-modules.e2e-spec.ts`.
 */
describe('crm — WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmWhatsappHelpers>;
  let dublê: GraphApiDublê;
  const ADMIN = authHeader();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    dublê = criarGraphApiDublê();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_API_CLIENT)
      .useValue(dublê)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmWhatsappHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    dublê.falharProximoEnvio = null;
    dublê.falharProximaBusca = null;
    dublê.proximoWaMessageId = '';
    dublê.proximosTemplates = [];
    dublê.chamadasEnviar = [];
    await prisma.crmAdminAudit.deleteMany({});
    await prisma.optOutWhatsapp.deleteMany({});
    // `mensagem_whatsapp.interacao_id` é `onDelete: Cascade` — apagar
    // `interacao` já limpa `mensagem_whatsapp`; `interacao.pessoa_id`/
    // `lead_id` são `onDelete: Restrict` (009), então precisa sumir antes de
    // qualquer `pessoa.deleteMany({})`/`lead.deleteMany({})` de outra suíte.
    await prisma.interacao.deleteMany({});
    await prisma.eventoWebhookWhatsapp.deleteMany({});
    await prisma.templateWhatsapp.deleteMany({});
    await prisma.canalWhatsapp.deleteMany({});
  });

  const http = () => request(app.getHttpServer());

  // ------------------------------------------------------------ US3: canal e templates

  describe('US3 — canal e templates', () => {
    it('cria canal, segredo nunca aparece em claro no GET', async () => {
      const canal = await h.criarCanal();
      const r = await http().get(`/crm/admin/whatsapp/canais/${canal.id}`).set(ADMIN);
      expect(r.status).toBe(200);
      expect(r.body.accessTokenDefinido).toBe(true);
      expect(r.body.accessTokenMascarado).toMatch(/^••••••/);
      expect(JSON.stringify(r.body)).not.toContain(canal.accessToken);
      expect(JSON.stringify(r.body)).not.toContain(canal.appSecret);
      expect(JSON.stringify(r.body)).not.toContain(canal.webhookVerifyToken);
    });

    it('phoneNumberId duplicado → 409', async () => {
      const canal = await h.criarCanal();
      const r = await http()
        .post('/crm/admin/whatsapp/canais')
        .set(ADMIN)
        .send({
          nome: 'Outro',
          numeroTelefone: '+5511911111111',
          wabaId: 'waba-outro',
          phoneNumberId: canal.phoneNumberId,
          accessToken: 'x',
          appSecret: 'y',
          webhookVerifyToken: 'z',
        });
      expect(r.status).toBe(409);
      expect(r.body.erro).toBe('phone_number_id_ja_conectado');
    });

    it('PATCH rotaciona segredo; sem DELETE', async () => {
      const canal = await h.criarCanal();
      const r = await http()
        .patch(`/crm/admin/whatsapp/canais/${canal.id}`)
        .set(ADMIN)
        .send({ accessToken: 'novo-access-token' });
      expect(r.status).toBe(200);
      expect(r.body.accessTokenMascarado).toMatch(/oken$/);

      const audit = await prisma.crmAdminAudit.findFirst({
        where: { entidadeId: canal.id, campo: 'segredo_rotacionado' },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit?.valorNovo)).not.toContain('novo-access-token');
    });

    it('sincroniza templates (upsert idempotente) e lista por status', async () => {
      const canal = await h.criarCanal();
      dublê.proximosTemplates = [
        {
          nomeMeta: 'boas_vindas',
          idioma: 'pt_BR',
          categoria: 'UTILITY',
          corpo: 'Olá {{1}}, tudo bem?',
          statusAprovacao: 'APPROVED',
          motivoRejeicao: null,
        },
      ];
      const r1 = await http()
        .post(`/crm/admin/whatsapp/canais/${canal.id}/templates/sincronizar`)
        .set(ADMIN);
      expect(r1.status).toBe(200);
      expect(r1.body.sincronizados).toBe(1);

      const r2 = await http()
        .post(`/crm/admin/whatsapp/canais/${canal.id}/templates/sincronizar`)
        .set(ADMIN);
      expect(r2.status).toBe(200);
      expect(r2.body.sincronizados).toBe(1);
      expect(await prisma.templateWhatsapp.count({ where: { canalId: canal.id } })).toBe(1);

      const lista = await http()
        .get(`/crm/admin/whatsapp/canais/${canal.id}/templates?statusAprovacao=APROVADO`)
        .set(ADMIN);
      expect(lista.status).toBe(200);
      expect(lista.body).toHaveLength(1);
      expect(lista.body[0].statusAprovacao).toBe('APROVADO');
    });

    it('dublê de falha na sincronização → 502, nada muda localmente', async () => {
      const canal = await h.criarCanal();
      dublê.falharProximaBusca = new Error('graph api indisponível');
      const r = await http()
        .post(`/crm/admin/whatsapp/canais/${canal.id}/templates/sincronizar`)
        .set(ADMIN);
      expect(r.status).toBe(502);
      expect(await prisma.templateWhatsapp.count({ where: { canalId: canal.id } })).toBe(0);
    });

    it('sem crm_admin:gerir_whatsapp → 403 ao criar canal', async () => {
      // Subject com formato de UUID válido mas sem `usuario` correspondente
      // (nem credencial de serviço) → 0 permissões efetivas → 403.
      const r = await http()
        .post('/crm/admin/whatsapp/canais')
        .set(bearer(issueTestToken({ subject: '00000000-0000-7000-8000-000000000000' })))
        .send({
          nome: 'x',
          numeroTelefone: 'x',
          wabaId: 'x',
          phoneNumberId: 'x',
          accessToken: 'x',
          appSecret: 'x',
          webhookVerifyToken: 'x',
        });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ------------------------------------------------------------ US1: webhook de entrada

  describe('US1 — webhook de entrada', () => {
    it('handshake GET com verify_token certo → 200 + eco do challenge', async () => {
      const canal = await h.criarCanal();
      const r = await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': canal.webhookVerifyToken, 'hub.challenge': 'abc123' });
      expect(r.status).toBe(200);
      expect(r.text).toBe('abc123');
    });

    it('handshake GET com verify_token errado → 403', async () => {
      await h.criarCanal();
      const r = await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': 'abc123' });
      expect(r.status).toBe(403);
    });

    it('POST sem assinatura ou assinatura errada → 401, nada persistido', async () => {
      const canal = await h.criarCanal();
      const de = waIdDe(numeroUnico());
      const payload = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de,
        idMensagem: 'wamid.SEMASSINATURA',
        texto: 'oi',
      });
      const semAssinatura = await http().post('/webhooks/whatsapp').send(payload);
      expect(semAssinatura.status).toBe(401);

      const corpo = JSON.stringify(payload);
      const errada = await http()
        .post('/webhooks/whatsapp')
        .set('X-Hub-Signature-256', 'sha256=' + '0'.repeat(64))
        .set('Content-Type', 'application/json')
        .send(corpo);
      expect(errada.status).toBe(401);

      expect(await prisma.eventoWebhookWhatsapp.count()).toBe(0);
      expect(await prisma.interacao.count()).toBe(0);
    });

    it('telefone conhecido (pessoa) → interação na timeline dela', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);
      const payload = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.PESSOA1',
        texto: 'Quero saber sobre o curso',
      });
      const r = await h.postWebhook(payload, canal.appSecret);
      expect(r.status).toBe(200);

      const timeline = await http().get(`/crm/pessoas/${pessoaId}/interacoes`).set(ADMIN);
      expect(timeline.body.itens).toHaveLength(1);
      expect(timeline.body.itens[0].conteudo).toBe('Quero saber sobre o curso');
      expect(timeline.body.itens[0].direcao).toBe('ENTRADA');
    });

    it('telefone desconhecido → cria Lead novo com origem whatsapp', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const payload = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.LEADNOVO1',
        texto: 'Oi, quero comprar',
        nomeContato: 'Maria Teste',
      });
      const r = await h.postWebhook(payload, canal.appSecret);
      expect(r.status).toBe(200);

      const lead = await prisma.lead.findFirst({ where: { telefone } });
      expect(lead).not.toBeNull();
      expect(lead?.origem).toBe('whatsapp');
      expect(lead?.nome).toBe('Maria Teste');

      const timeline = await http().get(`/crm/leads/${lead!.id}/interacoes`).set(ADMIN);
      expect(timeline.body.itens).toHaveLength(1);
    });

    it('reenvio do mesmo payload (mesmo hash) → 200, 0 registro novo', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const payload = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.DUPLICADA1',
        texto: 'mensagem única',
      });
      const r1 = await h.postWebhook(payload, canal.appSecret);
      expect(r1.status).toBe(200);
      const totalAntes = await prisma.eventoWebhookWhatsapp.count();
      const interacoesAntes = await prisma.interacao.count();

      const r2 = await h.postWebhook(payload, canal.appSecret);
      expect(r2.status).toBe(200);
      expect(await prisma.eventoWebhookWhatsapp.count()).toBe(totalAntes);
      expect(await prisma.interacao.count()).toBe(interacoesAntes);
    });

    it('mensagem de mídia → tipoConteudo correto na MensagemWhatsapp', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const payload = h.payloadMensagemMidia({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.MIDIA1',
        tipo: 'image',
        idMidia: 'MIDIA-EXT-1',
      });
      const r = await h.postWebhook(payload, canal.appSecret);
      expect(r.status).toBe(200);

      const lead = await prisma.lead.findFirst({ where: { telefone } });
      const mensagem = await prisma.mensagemWhatsapp.findFirst({ where: { waMessageId: 'wamid.MIDIA1' } });
      expect(mensagem?.tipoConteudo).toBe('IMAGEM');
      expect(mensagem?.midiaIdExterno).toBe('MIDIA-EXT-1');
      expect(lead).not.toBeNull();
    });

    it('callback de status atualiza MensagemWhatsapp de uma mensagem enviada', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);

      // Abre a janela de 24h com uma mensagem recebida antes de enviar.
      const entrada = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.ABREJANELA1',
        texto: 'abrindo a janela',
      });
      await h.postWebhook(entrada, canal.appSecret);

      dublê.proximoWaMessageId = 'wamid.ENVIADA1';
      const envio = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'resposta do time' });
      expect(envio.status).toBe(201);

      const status = h.payloadStatus({
        phoneNumberId: canal.phoneNumberId,
        waMessageId: 'wamid.ENVIADA1',
        status: 'delivered',
      });
      const r = await h.postWebhook(status, canal.appSecret);
      expect(r.status).toBe(200);

      const mensagem = await prisma.mensagemWhatsapp.findFirst({ where: { waMessageId: 'wamid.ENVIADA1' } });
      expect(mensagem?.statusEntrega).toBe('ENTREGUE');
    });
  });

  // ------------------------------------------------------------ US2: janela de 24h e envio

  describe('US2 — janela de 24h e envio', () => {
    it('janela reflete a última interação ENTRADA; envio livre dentro dela → 201', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);

      const semJanela = await http().get('/crm/whatsapp/janela').query({ pessoaId }).set(ADMIN);
      expect(semJanela.body.dentroDaJanela).toBe(false);

      const entrada = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.JANELA1',
        texto: 'oi',
      });
      await h.postWebhook(entrada, canal.appSecret);

      const comJanela = await http().get('/crm/whatsapp/janela').query({ pessoaId }).set(ADMIN);
      expect(comJanela.body.dentroDaJanela).toBe(true);

      const envio = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'resposta' });
      expect(envio.status).toBe(201);
    });

    it('fora da janela: livre → 409; template aprovado → 201; template pendente → 409', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);

      const fora = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'não pode' });
      expect(fora.status).toBe(409);
      expect(fora.body.erro).toBe('fora_da_janela_24h');

      dublê.proximosTemplates = [
        {
          nomeMeta: 'aprovado_teste',
          idioma: 'pt_BR',
          categoria: 'UTILITY',
          corpo: 'Olá!',
          statusAprovacao: 'APPROVED',
          motivoRejeicao: null,
        },
        {
          nomeMeta: 'pendente_teste',
          idioma: 'pt_BR',
          categoria: 'UTILITY',
          corpo: 'Olá!',
          statusAprovacao: 'PENDING',
          motivoRejeicao: null,
        },
      ];
      await http().post(`/crm/admin/whatsapp/canais/${canal.id}/templates/sincronizar`).set(ADMIN);
      const aprovado = await prisma.templateWhatsapp.findFirst({ where: { nomeMeta: 'aprovado_teste' } });
      const pendente = await prisma.templateWhatsapp.findFirst({ where: { nomeMeta: 'pendente_teste' } });

      const comTemplate = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'TEMPLATE', templateId: aprovado!.id, parametros: [] });
      expect(comTemplate.status).toBe(201);

      const comPendente = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'TEMPLATE', templateId: pendente!.id, parametros: [] });
      expect(comPendente.status).toBe(409);
      expect(comPendente.body.erro).toBe('template_nao_aprovado');
    });

    it('falha do provedor no envio → 502, nada persistido', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);
      const entrada = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.FALHA1',
        texto: 'oi',
      });
      await h.postWebhook(entrada, canal.appSecret);
      const interacoesAntes = await prisma.interacao.count();

      dublê.falharProximoEnvio = new Error('rate limit da meta');
      const r = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'vai falhar' });
      expect(r.status).toBe(502);
      expect(await prisma.interacao.count()).toBe(interacoesAntes);
    });
  });

  // ------------------------------------------------------------ US4: opt-out

  describe('US4 — opt-out', () => {
    it('registrar bloqueia envio; idempotente; reverter restaura', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);
      const entrada = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.OPTOUT1',
        texto: 'oi',
      });
      await h.postWebhook(entrada, canal.appSecret);

      const registrar1 = await http()
        .post('/crm/whatsapp/optout')
        .set(ADMIN)
        .send({ telefone, origem: 'PROPRIO_NUMERO' });
      expect(registrar1.status).toBe(200);
      const totalAntes = await prisma.optOutWhatsapp.count({ where: { telefone } });

      const registrar2 = await http()
        .post('/crm/whatsapp/optout')
        .set(ADMIN)
        .send({ telefone, origem: 'PROPRIO_NUMERO' });
      expect(registrar2.status).toBe(200);
      expect(await prisma.optOutWhatsapp.count({ where: { telefone } })).toBe(totalAntes);

      const bloqueado = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'não pode' });
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body.erro).toBe('destinatario_em_optout');

      const consulta = await http().get('/crm/whatsapp/optout').query({ telefone }).set(ADMIN);
      expect(consulta.body.emOptOut).toBe(true);

      const reverter = await http()
        .post('/crm/whatsapp/optout/reverter')
        .set(ADMIN)
        .send({ telefone });
      expect(reverter.status).toBe(200);

      const liberado = await http()
        .post('/crm/whatsapp/mensagens')
        .set(ADMIN)
        .send({ pessoaId, canalId: canal.id, modo: 'LIVRE', texto: 'agora pode' });
      expect(liberado.status).toBe(201);
    });

    it('reverter sem opt-out ativo → 404', async () => {
      const r = await http()
        .post('/crm/whatsapp/optout/reverter')
        .set(ADMIN)
        .send({ telefone: numeroUnico() });
      expect(r.status).toBe(404);
    });

    it('recebimento continua funcionando mesmo em opt-out', async () => {
      const canal = await h.criarCanal();
      const telefone = numeroUnico();
      const pessoaId = await h.criarPessoaComTelefone(telefone);
      await http().post('/crm/whatsapp/optout').set(ADMIN).send({ telefone, origem: 'ATENDENTE' });

      const entrada = h.payloadMensagemTexto({
        phoneNumberId: canal.phoneNumberId,
        de: waIdDe(telefone),
        idMensagem: 'wamid.RECEBEOPTOUT1',
        texto: 'ainda escrevo',
      });
      const r = await h.postWebhook(entrada, canal.appSecret);
      expect(r.status).toBe(200);

      const timeline = await http().get(`/crm/pessoas/${pessoaId}/interacoes`).set(ADMIN);
      expect(timeline.body.itens).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------ Guard, catálogo, regressão

  describe('Guard e catálogo', () => {
    it('rota autenticada sem token → 401', async () => {
      const r = await http().get('/crm/whatsapp/janela').query({ pessoaId: 'x' });
      expect(r.status).toBe(401);
    });

    it('webhook não exige JWT (rotas públicas)', async () => {
      const canal = await h.criarCanal();
      const r = await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': canal.webhookVerifyToken, 'hub.challenge': 'x' });
      expect(r.status).toBe(200);
    });

    it('GET /admin/rbac/permissoes inclui as 4 novas', async () => {
      const r = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const ids = r.body.recursos.flatMap((g: { permissoes: { id: string }[] }) =>
        g.permissoes.map((p) => p.id),
      );
      expect(ids).toEqual(
        expect.arrayContaining([
          'whatsapp:ver',
          'whatsapp:enviar',
          'whatsapp:gerir_optout',
          'crm_admin:gerir_whatsapp',
        ]),
      );
    });
  });
});
