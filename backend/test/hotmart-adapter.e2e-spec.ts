import { execFileSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTMART_API_CLIENT } from '../src/ingestao/adapters/hotmart';
import { authHeader } from './support/auth';
import {
  HotmartApiClientFake,
  HotmartApiClientIndisponivel,
  HOTMART_TOKENS,
  hotmartHelpers,
  fixture,
  fixtureCsv,
} from './support/hotmart';

/**
 * spec 022 — Adaptadores de borda da Hotmart (e2e, Postgres real).
 * A Hotmart **não tem webhook na v1**: a sincronização por API (OAuth2 + cursor,
 * dublê) é o caminho corrente. `GET /sales/history` + `GET /sales/price/details`
 * com merge por `transaction`. Import CSV. Afiliada / recorrência / estorno
 * colapsado. `status-map/hotmart.ts` traduzido; bruto inédito → revisão. Webhook
 * stub: 503 por padrão, funcional com `HOTMART_WEBHOOK_ENABLED=true`. Isolamento
 * PRD/SVC. Fronteira + não-regressão. Worker de fundo desligado (`setup-db.ts`).
 */
describe('hotmart — adaptadores de borda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof hotmartHelpers>;
  const http = () => request(app.getHttpServer());

  const vendas = fixture<{ items: unknown[] }>('api-sales-history-pagina.json').items;
  const detalhes = fixture<{ items: unknown[] }>('api-sales-price-details-pagina.json').items;

  // página 1 = fixture; página 2 = 1 venda extra (cursor sintético p1)
  const apiFake = new HotmartApiClientFake(
    [
      vendas,
      [
        {
          product: { id: 9, name: 'Item pagina 2' },
          buyer: { name: 'Pagina 2', email: 'pagina2@example.com' },
          purchase: {
            transaction: 'HP12455690120099',
            order_date: 1717500000000,
            approved_date: 1717503600000,
            status: 'APPROVED',
            commission_as: 'PRODUCER',
            is_subscription: false,
            price: { value: 50, currency_code: 'BRL' },
            offer: { code: 'pag2' },
          },
        },
      ],
    ],
    [detalhes],
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HOTMART_API_CLIENT)
      .useValue(apiFake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = hotmartHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    apiFake.chamadas.length = 0;
    apiFake.chamadasDetalhe.length = 0;
    await prisma.transacao.deleteMany({
      where: { plataformaOrigem: { in: ['HOTMART_PRD', 'HOTMART_SVC'] } },
    });
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({
      where: { plataformaOrigem: { in: ['HOTMART_PRD', 'HOTMART_SVC'] } },
    });
    const refs = await prisma.pessoaOrigemRef.findMany({
      where: { plataformaOrigem: { in: ['HOTMART_PRD', 'HOTMART_SVC'] } },
      select: { pessoaId: true },
    });
    const ids = [...new Set(refs.map((r) => r.pessoaId))];
    // `contrato` (025) tem FK `Restrict` para `pessoa` — apaga primeiro (cascade em `aditivo`).
    if (ids.length) await prisma.contrato.deleteMany({ where: { pessoaId: { in: ids } } });
    if (ids.length) await prisma.pessoa.deleteMany({ where: { id: { in: ids } } });
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — sincronização por API (OAuth2 + cursor)', () => {
    it('2 páginas encadeadas por cursor → resumo; re-disparo → novos: 0', async () => {
      const res = await h.sincronizar({
        conta: 'HOTMART_PRD',
        dataInicio: '2026-06-01',
        dataFinal: '2026-06-30',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ conta: 'HOTMART_PRD', paginas: 2, dedup: 0, erros: [] });
      expect(res.body.novos).toBe(4); // 3 da fixture + 1 da página 2
      expect(apiFake.chamadas[0].cursor).toBeUndefined();
      expect(apiFake.chamadas[1].cursor).toBe('p1');
      expect(apiFake.chamadasDetalhe.length).toBeGreaterThanOrEqual(1);

      const res2 = await h.sincronizar({
        conta: 'HOTMART_PRD',
        dataInicio: '2026-06-01',
        dataFinal: '2026-06-30',
      });
      expect(res2.body.novos).toBe(0);
      expect(res2.body.dedup).toBe(4);
    });

    it('processa → transacao APPROVED PAGO com oferta.codigoOrigem; WAITING_PAYMENT → PENDENTE', async () => {
      await h.sincronizar({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
      await h.processar();

      const paga = await prisma.transacao.findFirst({
        where: { idOrigem: 'HP12455690120001' },
      });
      expect(paga?.statusCanonico).toBe('PAGO');
      expect(paga?.classificacao).toBe('VENDA_PROPRIA');
      // spec 023: Hotmart resolve oferta só por catálogo importado (nunca por
      // tag); sem import nesta suíte, `price_code` não catalogado -> revisão.
      expect(paga?.precisaRevisao).toBe(true);
      expect(paga?.ofertaCodigoOrigem).toBe('k2pasun0');
      expect(paga?.valorBrutoMoeda).toBe('BRL');
      expect(paga?.valorBrutoInt).toBe(1506000n);

      const pend = await prisma.transacao.findFirst({
        where: { idOrigem: 'HP12455690120002' },
      });
      expect(pend?.statusCanonico).toBe('PENDENTE');
    });

    it('sem credenciais OAuth → 422, 0 eventos', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(HOTMART_API_CLIENT)
        .useValue(new HotmartApiClientIndisponivel())
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        const res = await request(app2.getHttpServer())
          .post('/ingestao/hotmart/sincronizar')
          .set(authHeader())
          .send({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
        expect(res.status).toBe(422);
        expect(
          await moduleRef.get(PrismaService).eventoOrigem.count({
            where: { plataformaOrigem: 'HOTMART_PRD' },
          }),
        ).toBe(0);
      } finally {
        await app2.close();
      }
    });

    it('conta fora do enum → 422; janela > 365 dias → 422, API não chamada', async () => {
      expect(
        (await h.sincronizar({ conta: 'HOTMART_XYZ', dataInicio: '2026-06-01', dataFinal: '2026-06-30' }))
          .status,
      ).toBe(422);
      const res = await h.sincronizar({
        conta: 'HOTMART_PRD',
        dataInicio: '2025-01-01',
        dataFinal: '2026-12-31',
      });
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/365 dias/);
      expect(apiFake.chamadas).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — merge de preço, afiliada, recorrência, estorno, revisão', () => {
    it('detalhe de preço casado → payload_bruto.price_details; venda sem detalhe → sem erro', async () => {
      await h.sincronizar({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
      const comDetalhe = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: 'HP12455690120001' },
      });
      expect(JSON.stringify(comDetalhe?.payloadBruto)).toContain('price_details');
      expect(JSON.stringify(comDetalhe?.payloadBruto)).toContain('ABC10');

      const semDetalhe = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: 'HP12455690120002' },
      });
      expect(JSON.stringify(semDetalhe?.payloadBruto)).not.toContain('price_details');
      expect(semDetalhe?.status).not.toBe('erro');
    });

    it('commission_as AFFILIATE → VENDA_AFILIADA', async () => {
      await h.sincronizar({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
      await h.processar();
      const tx = await prisma.transacao.findFirst({
        where: { idOrigem: 'HP12455690120003' },
      });
      expect(tx?.classificacao).toBe('VENDA_AFILIADA');
    });

    it('is_subscription + recurrency_number 3 → RECORRENCIA', async () => {
      const fake = new HotmartApiClientFake(
        [fixture<{ items: unknown[] }>('api-sales-history-assinatura.json').items],
        [[]],
      );
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(HOTMART_API_CLIENT)
        .useValue(fake)
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        await request(app2.getHttpServer())
          .post('/ingestao/hotmart/sincronizar')
          .set(authHeader())
          .send({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
        await request(app2.getHttpServer())
          .post('/ingestao/eventos/processar')
          .set(authHeader());
        const tx = await moduleRef.get(PrismaService).transacao.findFirst({
          where: { idOrigem: 'HP12455690120050' },
        });
        expect(tx?.classificacao).toBe('RECORRENCIA');
      } finally {
        await app2.close();
      }
    });

    it('APPROVED + PARTIALLY_REFUNDED mesmo transaction → 2 eventos, 1 transacao ESTORNADO/REEMBOLSO', async () => {
      const fake = new HotmartApiClientFake(
        [fixture<{ items: unknown[] }>('api-sales-history-refund.json').items],
        [[]],
      );
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(HOTMART_API_CLIENT)
        .useValue(fake)
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      const p2 = moduleRef.get(PrismaService);
      try {
        await request(app2.getHttpServer())
          .post('/ingestao/hotmart/sincronizar')
          .set(authHeader())
          .send({ conta: 'HOTMART_PRD', dataInicio: '2026-05-01', dataFinal: '2026-05-31' });
        await request(app2.getHttpServer())
          .post('/ingestao/eventos/processar')
          .set(authHeader());
        const txs = await p2.transacao.findMany({
          where: { idOrigem: 'HP12455690120090' },
        });
        expect(txs).toHaveLength(1);
        expect(txs[0].statusCanonico).toBe('ESTORNADO');
        expect(txs[0].classificacao).toBe('REEMBOLSO');
        expect(
          await p2.eventoOrigem.count({ where: { idOrigem: 'HP12455690120090' } }),
        ).toBe(2);
      } finally {
        await app2.close();
      }
    });

    it('status inédito (STARTED) → transacao DESCONHECIDO + revisão; evento revisar', async () => {
      const fake = new HotmartApiClientFake(
        [fixture<{ items: unknown[] }>('api-sales-history-vocabulario.json').items],
        [[]],
      );
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(HOTMART_API_CLIENT)
        .useValue(fake)
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      const p2 = moduleRef.get(PrismaService);
      try {
        await request(app2.getHttpServer())
          .post('/ingestao/hotmart/sincronizar')
          .set(authHeader())
          .send({ conta: 'HOTMART_PRD', dataInicio: '2026-05-01', dataFinal: '2026-05-31' });
        await request(app2.getHttpServer())
          .post('/ingestao/eventos/processar')
          .set(authHeader());
        const tx = await p2.transacao.findFirst({
          where: { idOrigem: 'HPVOC0000000014' }, // STARTED
        });
        expect(tx?.statusCanonico).toBe('DESCONHECIDO');
        expect(tx?.precisaRevisao).toBe(true);
        const ev = await p2.eventoOrigem.findFirst({
          where: { idOrigem: 'HPVOC0000000014' },
        });
        expect(ev?.status).toBe('revisar');
        // um status mapeado (CHARGEBACK) do mesmo lote → CHARGEBACK sem revisão
        const cb = await p2.transacao.findFirst({ where: { idOrigem: 'HPVOC0000000009' } });
        expect(cb?.statusCanonico).toBe('CHARGEBACK');
        // spec 023: sem catálogo Hotmart importado nesta suíte, `price_code` não
        // catalogado -> revisão (independente do status já estar mapeado).
        expect(cb?.precisaRevisao).toBe(true);
      } finally {
        await app2.close();
      }
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — import CSV', () => {
    it('6 linhas (5 boas + 1 sem id) → 200 { novos: 5, ignoradas: 1 }; 2º import → novos: 0', async () => {
      const csv = fixtureCsv('export-vendas.csv');
      const r1 = await h.importarCsv('HOTMART_SVC', csv);
      expect(r1.status).toBe(200);
      expect(r1.body).toMatchObject({
        conta: 'HOTMART_SVC',
        linhas: 6,
        novos: 5,
        ignoradas: 1,
      });
      expect(r1.body.erros.join(' ')).toMatch(/sem identificador de transação/);

      const r2 = await h.importarCsv('HOTMART_SVC', csv);
      expect(r2.body.novos).toBe(0);
      expect(r2.body.dedup).toBe(5);
    });
  });

  // ---------------------------------------------------------------- US4 (webhook stub)

  describe('US4 — webhook stub (desligado por padrão)', () => {
    it('flag desligado → POST /webhooks/hotmart/prd (hottok válido) → 503, 0 evento', async () => {
      const res = await h.postWebhook('HOTMART_PRD', fixture('webhook-purchase-approved.json'));
      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).toMatch(/não habilitado/);
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });

    it('flag ligado (2ª instância) → 200 + 1 evento hotmart.webhook; hottok errado → 401', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(HOTMART_API_CLIENT)
        .useValue(apiFake)
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      const p2 = moduleRef.get(PrismaService);
      // O `ConfigModule.forRoot` valida `process.env` uma única vez por processo;
      // liga o flag na instância de teste (restaurado no finally).
      const cfg = moduleRef.get(ConfigService);
      cfg.set('HOTMART_WEBHOOK_ENABLED', true);
      try {
        const ok = await request(app2.getHttpServer())
          .post('/webhooks/hotmart/prd')
          .set('x-hotmart-hottok', HOTMART_TOKENS.HOTMART_PRD)
          .send(fixture('webhook-purchase-approved.json'));
        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({ registrados: 1, ignorados: 0 });

        const ev = await p2.eventoOrigem.findFirst({
          where: { plataformaOrigem: 'HOTMART_PRD' },
        });
        expect(ev?.tipoOrigem).toBe('hotmart.webhook');
        expect(ev?.idOrigem).toBe('HP12455690120001');
        expect(JSON.stringify(ev?.payloadBruto)).not.toContain('hottok');
        expect(JSON.stringify(ev?.payloadBruto)).not.toContain('HOTTOK-FIXTURE');

        await request(app2.getHttpServer())
          .post('/ingestao/eventos/processar')
          .set(authHeader());
        const tx = await p2.transacao.findFirst({ where: { idOrigem: 'HP12455690120001' } });
        expect(tx?.statusCanonico).toBe('PAGO');

        const errado = await request(app2.getHttpServer())
          .post('/webhooks/hotmart/prd')
          .set('x-hotmart-hottok', 'nope')
          .send(fixture('webhook-purchase-approved.json'));
        expect(errado.status).toBe(401);
      } finally {
        cfg.set('HOTMART_WEBHOOK_ENABLED', false);
        await app2.close();
        await prisma.transacao.deleteMany({ where: { plataformaOrigem: 'HOTMART_PRD' } });
        await prisma.eventoEtapa.deleteMany({});
        await prisma.eventoOrigem.deleteMany({ where: { plataformaOrigem: 'HOTMART_PRD' } });
      }
    });
  });

  // ------------------------------------------------------- isolamento de contas

  it('SC-016: mesmo transaction em HOTMART_PRD e HOTMART_SVC → 2 transações distintas', async () => {
    // o `apiFake` serve a mesma fixture de vendas às duas contas.
    await h.sincronizar({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
    await h.sincronizar({ conta: 'HOTMART_SVC', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
    await h.processar();
    const txs = await prisma.transacao.findMany({
      where: { idOrigem: 'HP12455690120001' },
      orderBy: { plataformaOrigem: 'asc' },
    });
    expect(txs.map((t) => t.plataformaOrigem)).toEqual(['HOTMART_PRD', 'HOTMART_SVC']);
  });

  // ------------------------------------------------------- fronteira / regressão

  it('fronteira: adapters/hotmart não importa financeiro/clientes; status-map não importa ingestao', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync('grep', ['-rEl', proibido, alvo], { encoding: 'utf8' });
      } catch {
        return '';
      }
    };
    expect(grep('src/ingestao/adapters/hotmart', "from '.*/financeiro")).toBe('');
    expect(grep('src/ingestao/adapters/hotmart', "from '.*/clientes")).toBe('');
    expect(grep('src/ingestao/hotmart', "from '.*/financeiro")).toBe('');
    expect(grep('src/financeiro/domain/status-map', "from '.*/ingestao")).toBe('');
  });

  it('segredo: nenhum client_secret / access_token / hottok no evento_origem', async () => {
    await h.sincronizar({ conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' });
    const evs = await prisma.eventoOrigem.findMany({ where: { plataformaOrigem: 'HOTMART_PRD' } });
    const blob = JSON.stringify(evs);
    for (const proibido of ['client_secret', 'access_token', 'hottok', 'Basic ']) {
      expect(blob).not.toContain(proibido);
    }
  });

  it('catálogo RBAC sem permissão nova; /health = 11 contextos', async () => {
    const perms = await http().get('/admin/rbac/permissoes').set(authHeader());
    const json = JSON.stringify(perms.body);
    expect(json).not.toMatch(/"hotmart:/);
    expect(json).toContain('evento:ingerir');

    const health = await http().get('/health');
    expect(health.body.contexts).toHaveLength(11);
  });
});
