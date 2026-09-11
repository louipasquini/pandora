import { execFileSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ASAAS_API_CLIENT } from '../src/ingestao/adapters/asaas';
import { authHeader } from './support/auth';
import {
  AsaasApiClientFake,
  AsaasApiClientIndisponivel,
  ASAAS_TOKENS,
  asaasHelpers,
  fixture,
  fixtureCsv,
} from './support/asaas';

/**
 * spec 020 — Adaptadores de borda da Asaas (e2e, Postgres real).
 * Webhooks públicos por conta (`/webhooks/asaas/{prd,svc}`) → evento cru → worker
 * → `transacao` consolidada (1 por cobrança, mesmo com N eventos). Ponte Guru
 * (`externalReference`). Sincronização por API (dublê) e import CSV.
 * `status-map/asaas.ts` traduzido; bruto inédito → revisão. Isolamento entre PRD
 * e SVC. Fronteira de contexto + não-regressão do pipeline.
 * O laço de fundo do worker fica desligado (`setup-db.ts`).
 */
describe('asaas — adaptadores de borda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof asaasHelpers>;
  const http = () => request(app.getHttpServer());

  const apiFake = new AsaasApiClientFake([
    (fixture('api-payments-pagina.json') as { data: unknown[] }).data,
    [
      {
        object: 'payment',
        id: 'pay_page2_0000000000001',
        status: 'RECEIVED',
        value: 50,
        dateCreated: '2026-03-09',
        paymentDate: '2026-03-09',
      },
    ],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ASAAS_API_CLIENT)
      .useValue(apiFake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = asaasHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    apiFake.chamadas.length = 0;
    await prisma.transacao.deleteMany({
      where: { plataformaOrigem: { in: ['ASAAS_PRD', 'ASAAS_SVC'] } },
    });
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({
      where: { plataformaOrigem: { in: ['ASAAS_PRD', 'ASAAS_SVC'] } },
    });
    const refs = await prisma.pessoaOrigemRef.findMany({
      where: { plataformaOrigem: { in: ['ASAAS_PRD', 'ASAAS_SVC'] } },
      select: { pessoaId: true },
    });
    const ids = [...new Set(refs.map((r) => r.pessoaId))];
    // `contrato` (025) tem FK `Restrict` para `pessoa` — apaga primeiro (cascade em `aditivo`).
    if (ids.length) await prisma.contrato.deleteMany({ where: { pessoaId: { in: ids } } });
    if (ids.length) await prisma.pessoa.deleteMany({ where: { id: { in: ids } } });
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — webhook de cobrança por conta', () => {
    it('PAYMENT_RECEIVED + token PRD → 200, 1 evento asaas.webhook, payload_bruto intacto', async () => {
      const body = fixture('webhook-payment-received.json');
      const res = await h.postWebhook('ASAAS_PRD', body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ registrados: 1, ignorados: 0 });

      const ev = await prisma.eventoOrigem.findFirst({
        where: { plataformaOrigem: 'ASAAS_PRD' },
      });
      expect(ev?.tipoOrigem).toBe('asaas.webhook');
      expect(ev?.idOrigem).toBe('pay_9f8e7d6c5b4a30291817');
      expect(ev?.payloadBruto).toEqual(body);
      expect(ev?.eventoCanonico).not.toBeNull();
    });

    it('processa → 1 transacao (ASAAS_PRD, pay_...) PAGO', async () => {
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-received.json'));
      await h.processar();

      const txs = await prisma.transacao.findMany({
        where: { plataformaOrigem: 'ASAAS_PRD' },
      });
      expect(txs).toHaveLength(1);
      expect(txs[0].idOrigem).toBe('pay_9f8e7d6c5b4a30291817');
      expect(txs[0].statusCanonico).toBe('PAGO');
      expect(txs[0].classificacao).toBe('VENDA_PROPRIA');
      // spec 023: RESOLVER_OFERTA agora é real; a descrição da cobrança desta
      // fixture não carrega uma tag AEN decodificável -> revisão (Regra nº 15).
      expect(txs[0].precisaRevisao).toBe(true);
    });

    it('PAYMENT_OVERDUE → EM_ATRASO; PAYMENT_DELETED → CANCELADO', async () => {
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-overdue.json'));
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-deleted.json'));
      await h.processar();
      const over = await prisma.transacao.findFirst({
        where: { idOrigem: 'pay_1a2b3c4d5e6f70819200' },
      });
      const del = await prisma.transacao.findFirst({
        where: { idOrigem: 'pay_2b3c4d5e6f708192a3b4' },
      });
      expect(over?.statusCanonico).toBe('EM_ATRASO');
      expect(del?.statusCanonico).toBe('CANCELADO');
    });

    it('sem token / token errado / token de SVC em /prd → 401, nenhum evento', async () => {
      const semToken = await h.postWebhook(
        'ASAAS_PRD',
        fixture('webhook-payment-received.json'),
        null,
      );
      expect(semToken.status).toBe(401);
      const errado = await h.postWebhook(
        'ASAAS_PRD',
        fixture('webhook-payment-received.json'),
        'nope',
      );
      expect(errado.status).toBe(401);
      // cross-account: só dá para exercitar quando os dois tokens diferem
      // (no `.env` de exemplo ambos são "placeholder"). A isolação de contas em
      // si é coberta pelo teste SC-015.
      if (ASAAS_TOKENS.ASAAS_SVC !== ASAAS_TOKENS.ASAAS_PRD) {
        const tokenTrocado = await h.postWebhook(
          'ASAAS_PRD',
          fixture('webhook-payment-received.json'),
          ASAAS_TOKENS.ASAAS_SVC,
        );
        expect(tokenTrocado.status).toBe(401);
      }
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });

    it('corpo sem payment (evento não-cobrança) → 200 { registrados: 0, ignorados: 1 }, 0 evento', async () => {
      const res = await h.postWebhook('ASAAS_PRD', {
        event: 'TRANSFER_CREATED',
        transfer: { id: 'tra_1' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ registrados: 0, ignorados: 1 });
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — ponte Guru + estorno + revisão', () => {
    it('PAYMENT_CONFIRMED com externalReference → referenciaExterna sem plataforma; não força revisão', async () => {
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-confirmed-guru.json'));
      const ev = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: 'pay_3c4d5e6f708192a3b4c5' },
      });
      const canonico = ev?.eventoCanonico as {
        referenciaExterna?: Record<string, unknown>;
      } | null;
      expect(canonico?.referenciaExterna).toEqual({ idOrigem: 'guru-tx-abc123' });
      expect(canonico?.referenciaExterna).not.toHaveProperty('plataforma');

      await h.processar();
      const tx = await prisma.transacao.findFirst({
        where: { idOrigem: 'pay_3c4d5e6f708192a3b4c5' },
      });
      // A fixture tem `subscription` → RECORRENCIA (sem ela seria VENDA_PROPRIA).
      // O ponto (A-02): o `externalReference` **sozinho**, sem `plataforma`, NÃO
      // dispara a regra 2 de `classificar` → nunca `DESCONHECIDO`/revisão aqui.
      expect(tx?.classificacao).toBe('RECORRENCIA');
      // spec 023: RESOLVER_OFERTA agora é real; sem tag AEN decodificável na
      // descrição desta fixture -> revisão (independente do ponto A-02 acima).
      expect(tx?.precisaRevisao).toBe(true);
      expect(tx?.statusCanonico).toBe('PAGO');
    });

    it('PAYMENT_RECEIVED + PAYMENT_REFUNDED mesmo pay_id → 2 eventos, 1 transacao ESTORNADO/REEMBOLSO', async () => {
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-received.json'));
      const refund = await h.postWebhook(
        'ASAAS_PRD',
        fixture('webhook-payment-refunded.json'),
      );
      expect(refund.status).toBe(200);
      await h.processar();

      const txs = await prisma.transacao.findMany({
        where: { idOrigem: 'pay_9f8e7d6c5b4a30291817' },
      });
      expect(txs).toHaveLength(1);
      expect(txs[0].statusCanonico).toBe('ESTORNADO');
      expect(txs[0].classificacao).toBe('REEMBOLSO');
      expect(
        await prisma.eventoOrigem.count({
          where: { idOrigem: 'pay_9f8e7d6c5b4a30291817' },
        }),
      ).toBe(2);
    });

    it('reenviar o mesmo evento → dedup por hash (count estável)', async () => {
      await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-received.json'));
      const antes = await prisma.eventoOrigem.count();
      const r2 = await h.postWebhook('ASAAS_PRD', fixture('webhook-payment-received.json'));
      expect(r2.status).toBe(200);
      expect(await prisma.eventoOrigem.count()).toBe(antes);
    });

    it('payment.status inédito → transacao DESCONHECIDO + revisão; evento revisar', async () => {
      await h.postWebhook('ASAAS_PRD', {
        event: 'PAYMENT_UPDATED',
        payment: {
          object: 'payment',
          id: 'pay_inedito000000000001',
          status: 'AUTHORIZED',
          value: 10,
          dateCreated: '2026-03-01',
        },
      });
      await h.processar();
      const tx = await prisma.transacao.findFirst({
        where: { idOrigem: 'pay_inedito000000000001' },
      });
      expect(tx?.statusCanonico).toBe('DESCONHECIDO');
      expect(tx?.precisaRevisao).toBe(true);
      const ev = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: 'pay_inedito000000000001' },
      });
      expect(ev?.status).toBe('revisar');
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — sincronização por API', () => {
    it('dublê de 2 páginas → resumo; re-disparo → novos: 0', async () => {
      const res = await h.sincronizar({
        conta: 'ASAAS_PRD',
        dataInicio: '2026-03-01',
        dataFinal: '2026-03-31',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ conta: 'ASAAS_PRD', paginas: 2, dedup: 0, erros: [] });
      expect(res.body.novos).toBeGreaterThanOrEqual(3);
      expect(apiFake.chamadas[0]).toMatchObject({
        conta: 'ASAAS_PRD',
        dataInicio: '2026-03-01',
        offset: 0,
      });

      const novos1 = res.body.novos;
      const res2 = await h.sincronizar({ conta: 'ASAAS_PRD', dataInicio: '2026-03-01' });
      expect(res2.body.novos).toBe(0);
      expect(res2.body.dedup).toBe(novos1);
    });

    it('conta fora do enum → 422', async () => {
      const res = await h.sincronizar({ conta: 'ASAAS_XYZ' });
      expect(res.status).toBe(422);
    });

    it('conta sem API configurada → 422, 0 eventos', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ASAAS_API_CLIENT)
        .useValue(new AsaasApiClientIndisponivel())
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        const res = await request(app2.getHttpServer())
          .post('/ingestao/asaas/sincronizar')
          .set(authHeader())
          .send({ conta: 'ASAAS_PRD' });
        expect(res.status).toBe(422);
        expect(
          await moduleRef.get(PrismaService).eventoOrigem.count({
            where: { plataformaOrigem: 'ASAAS_PRD' },
          }),
        ).toBe(0);
      } finally {
        await app2.close();
      }
    });
  });

  // ---------------------------------------------------------------- US4

  describe('US4 — import CSV', () => {
    it('6 linhas (5 boas + 1 sem id) → 200 { novos: 5, ignoradas: 1 }; 2º import → novos: 0', async () => {
      const csv = fixtureCsv('export-cobrancas.csv');
      const r1 = await h.importarCsv('ASAAS_SVC', csv);
      expect(r1.status).toBe(200);
      expect(r1.body).toMatchObject({
        conta: 'ASAAS_SVC',
        linhas: 6,
        novos: 5,
        ignoradas: 1,
      });
      expect(r1.body.erros.join(' ')).toMatch(/sem identificador de cobrança/);

      const r2 = await h.importarCsv('ASAAS_SVC', csv);
      expect(r2.body.novos).toBe(0);
      expect(r2.body.dedup).toBe(5);
    });
  });

  // ------------------------------------------------------- isolamento de contas

  it('SC-015: mesmo payment.id em /prd e /svc → 2 transações distintas', async () => {
    const body = fixture('webhook-payment-received.json');
    await h.postWebhook('ASAAS_PRD', body);
    await h.postWebhook('ASAAS_SVC', body);
    await h.processar();
    const txs = await prisma.transacao.findMany({
      where: { idOrigem: 'pay_9f8e7d6c5b4a30291817' },
      orderBy: { plataformaOrigem: 'asc' },
    });
    expect(txs.map((t) => t.plataformaOrigem)).toEqual(['ASAAS_PRD', 'ASAAS_SVC']);
  });

  // ------------------------------------------------------- fronteira / regressão

  it('fronteira: adapters/asaas não importa financeiro/clientes; status-map não importa ingestao', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync('grep', ['-rEl', proibido, alvo], { encoding: 'utf8' });
      } catch {
        return '';
      }
    };
    expect(grep('src/ingestao/adapters/asaas', "from '.*/financeiro")).toBe('');
    expect(grep('src/ingestao/adapters/asaas', "from '.*/clientes")).toBe('');
    expect(grep('src/ingestao/asaas', "from '.*/financeiro")).toBe('');
    expect(grep('src/financeiro/domain/status-map', "from '.*/ingestao")).toBe('');
  });

  it('catálogo RBAC sem permissão nova; /health = 11 contextos', async () => {
    const perms = await http().get('/admin/rbac/permissoes').set(authHeader());
    const json = JSON.stringify(perms.body);
    expect(json).not.toMatch(/"asaas:/);
    expect(json).toContain('evento:ingerir');

    const health = await http().get('/health');
    expect(health.body.contexts).toHaveLength(11);
  });
});
