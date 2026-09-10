import { execFileSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GURU_API_CLIENT } from '../src/ingestao/adapters/guru';
import { authHeader } from './support/auth';
import {
  GuruApiClientFake,
  GuruApiClientIndisponivel,
  GURU_TOKENS,
  guruHelpers,
  fixture,
  fixtureCsv,
} from './support/guru';

/**
 * spec 021 — Adaptadores de borda da Guru (e2e, Postgres real).
 * Webhooks públicos por conta (`/webhooks/guru/{prd,svc}`), token `api_token` **no
 * corpo** → evento cru (sem o token) → worker → `transacao` consolidada (1 por
 * venda, mesmo com N eventos). Afiliada / recorrência / plano negado.
 * Sincronização por API **cursor** (dublê). Import CSV. `status-map/guru.ts`
 * traduzido; bruto inédito → revisão. Isolamento entre PRD e SVC. Fronteira de
 * contexto + não-regressão do pipeline. O laço de fundo do worker fica desligado
 * (`setup-db.ts`).
 */
describe('guru — adaptadores de borda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof guruHelpers>;
  const http = () => request(app.getHttpServer());

  const apiFake = new GuruApiClientFake([
    (fixture('api-transactions-pagina.json') as { data: unknown[] }).data,
    [
      {
        id: '9081534a-7512-4dab-9172-218c1dc1b999',
        status: 'approved',
        type: 'producer',
        dates: { ordered_at: '2026-03-15T10:00:00Z', confirmed_at: '2026-03-15T10:01:00Z' },
        contact: { name: 'Pagina 2', email: 'pagina2@example.com' },
        payment: { currency: 'BRL', gross: 50, net: 47 },
        product: {
          id: 'p9',
          name: 'Item pagina 2',
          type: 'product',
          qty: 1,
          total_value: 50,
          unit_value: 50,
          offer: { id: 'of_pag2', name: 'Pag2' },
        },
        items: [],
        subscription: [],
      },
    ],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GURU_API_CLIENT)
      .useValue(apiFake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = guruHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    apiFake.chamadas.length = 0;
    await prisma.transacao.deleteMany({
      where: { plataformaOrigem: { in: ['GURU_PRD', 'GURU_SVC'] } },
    });
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({
      where: { plataformaOrigem: { in: ['GURU_PRD', 'GURU_SVC'] } },
    });
    const refs = await prisma.pessoaOrigemRef.findMany({
      where: { plataformaOrigem: { in: ['GURU_PRD', 'GURU_SVC'] } },
      select: { pessoaId: true },
    });
    const ids = [...new Set(refs.map((r) => r.pessoaId))];
    if (ids.length) await prisma.pessoa.deleteMany({ where: { id: { in: ids } } });
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — webhook de Vendas por conta', () => {
    it('venda approved + api_token PRD → 200, 1 evento guru.webhook SEM api_token', async () => {
      const res = await h.postWebhook('GURU_PRD', fixture('webhook-venda-approved.json'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ registrados: 1, ignorados: 0 });

      const ev = await prisma.eventoOrigem.findFirst({
        where: { plataformaOrigem: 'GURU_PRD' },
      });
      expect(ev?.tipoOrigem).toBe('guru.webhook');
      expect(ev?.idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc10001');
      expect(JSON.stringify(ev?.payloadBruto)).not.toContain('api_token');
      expect(JSON.stringify(ev?.payloadBruto)).not.toContain(GURU_TOKENS.GURU_PRD);
      expect(ev?.eventoCanonico).not.toBeNull();
    });

    it('processa → 1 transacao (GURU_PRD, <id>) PAGO com oferta.codigoOrigem', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-approved.json'));
      await h.processar();

      const txs = await prisma.transacao.findMany({
        where: { plataformaOrigem: 'GURU_PRD' },
      });
      expect(txs).toHaveLength(1);
      expect(txs[0].idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc10001');
      expect(txs[0].statusCanonico).toBe('PAGO');
      expect(txs[0].classificacao).toBe('VENDA_PROPRIA');
      expect(txs[0].precisaRevisao).toBe(false);
      expect(txs[0].ofertaCodigoOrigem).toBe('of_nmx_anual');
      expect(txs[0].valorBrutoMoeda).toBe('BRL');
      expect(txs[0].valorBrutoInt).toBe(4970000n);
    });

    it('waiting_payment → PENDENTE; chargeback → CHARGEBACK + REEMBOLSO', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-waiting-payment.json'));
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-chargeback.json'));
      await h.processar();
      const wp = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10002' },
      });
      const cb = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10003' },
      });
      expect(wp?.statusCanonico).toBe('PENDENTE');
      expect(cb?.statusCanonico).toBe('CHARGEBACK');
      expect(cb?.classificacao).toBe('REEMBOLSO');
    });

    it('sem api_token / token errado / token de SVC em /prd → 401, nenhum evento', async () => {
      const semToken = await h.postWebhook(
        'GURU_PRD',
        fixture('webhook-venda-approved.json'),
        null,
      );
      expect(semToken.status).toBe(401);
      const errado = await h.postWebhook(
        'GURU_PRD',
        fixture('webhook-venda-approved.json'),
        'nope',
      );
      expect(errado.status).toBe(401);
      if (GURU_TOKENS.GURU_SVC !== GURU_TOKENS.GURU_PRD) {
        const trocado = await h.postWebhook(
          'GURU_PRD',
          fixture('webhook-venda-approved.json'),
          GURU_TOKENS.GURU_SVC,
        );
        expect(trocado.status).toBe(401);
      }
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });

    it('corpo sem id de transação (webhook de assinatura) → 200 { registrados: 0, ignorados: 1 }, 0 evento', async () => {
      const res = await h.postWebhook('GURU_PRD', {
        webhook_type: 'subscription',
        subscription: { id: 'sub_x', last_status: 'active' },
        contact: { email: 'x@example.com' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ registrados: 0, ignorados: 1 });
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — afiliada, recorrência, estorno, revisão', () => {
    it('type "affiliate" → VENDA_AFILIADA', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-afiliada.json'));
      await h.processar();
      const tx = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10004' },
      });
      expect(tx?.classificacao).toBe('VENDA_AFILIADA');
    });

    it('plano com invoice.cycle=3 → RECORRENCIA; plano negado sem subscription → RECUSADO sem assinatura', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-assinatura-ciclo.json'));
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-plano-negado.json'));
      await h.processar();
      const ciclo = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10005' },
      });
      const negado = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10006' },
      });
      expect(ciclo?.classificacao).toBe('RECORRENCIA');
      expect(negado?.statusCanonico).toBe('RECUSADO');
      const evNegado = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10006' },
      });
      const canonico = evNegado?.eventoCanonico as {
        assinatura?: unknown;
      } | null;
      expect(canonico?.assinatura).toBeUndefined();
    });

    it('approved + refunded mesmo id → 2 eventos, 1 transacao ESTORNADO/REEMBOLSO', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-approved.json'));
      const refund = await h.postWebhook('GURU_PRD', fixture('webhook-venda-refunded.json'));
      expect(refund.status).toBe(200);
      await h.processar();

      const txs = await prisma.transacao.findMany({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10001' },
      });
      expect(txs).toHaveLength(1);
      expect(txs[0].statusCanonico).toBe('ESTORNADO');
      expect(txs[0].classificacao).toBe('REEMBOLSO');
      expect(
        await prisma.eventoOrigem.count({
          where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10001' },
        }),
      ).toBe(2);
    });

    it('reenviar o mesmo evento → dedup por hash', async () => {
      await h.postWebhook('GURU_PRD', fixture('webhook-venda-approved.json'));
      const antes = await prisma.eventoOrigem.count();
      const r2 = await h.postWebhook('GURU_PRD', fixture('webhook-venda-approved.json'));
      expect(r2.status).toBe(200);
      expect(await prisma.eventoOrigem.count()).toBe(antes);
    });

    it('status inédito (trial) → transacao DESCONHECIDO + revisão; evento revisar', async () => {
      await h.postWebhook('GURU_PRD', {
        id: '9081534a-7512-4dab-9172-218c1dc1eeee',
        status: 'trial',
        type: 'producer',
        dates: { ordered_at: '2026-03-01T10:00:00Z' },
        contact: { email: 'trial@example.com' },
        payment: { currency: 'BRL', gross: 0 },
        product: {
          id: 'pt',
          name: 'Trial',
          type: 'plan',
          qty: 1,
          total_value: 0,
          unit_value: 0,
          offer: { id: 'of_trial', name: 'Trial' },
        },
        items: [],
        subscription: { id: 'sub_trial' },
      });
      await h.processar();
      const tx = await prisma.transacao.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc1eeee' },
      });
      expect(tx?.statusCanonico).toBe('DESCONHECIDO');
      expect(tx?.precisaRevisao).toBe(true);
      const ev = await prisma.eventoOrigem.findFirst({
        where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc1eeee' },
      });
      expect(ev?.status).toBe('revisar');
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — sincronização por API (cursor)', () => {
    it('dublê de 2 páginas encadeadas por cursor → resumo; re-disparo → novos: 0', async () => {
      const res = await h.sincronizar({
        conta: 'GURU_PRD',
        dataInicio: '2026-03-01',
        dataFinal: '2026-03-31',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ conta: 'GURU_PRD', paginas: 2, dedup: 0, erros: [] });
      expect(res.body.novos).toBeGreaterThanOrEqual(4);
      expect(apiFake.chamadas[0]).toMatchObject({
        conta: 'GURU_PRD',
        dataInicio: '2026-03-01',
        campoData: 'ordered_at',
      });
      expect(apiFake.chamadas[0].cursor).toBeUndefined();
      expect(apiFake.chamadas[1].cursor).toBe('p1');

      const novos1 = res.body.novos;
      const res2 = await h.sincronizar({
        conta: 'GURU_PRD',
        dataInicio: '2026-03-01',
        dataFinal: '2026-03-31',
      });
      expect(res2.body.novos).toBe(0);
      expect(res2.body.dedup).toBe(novos1);
    });

    it('conta fora do enum → 422', async () => {
      const res = await h.sincronizar({
        conta: 'GURU_XYZ',
        dataInicio: '2026-03-01',
        dataFinal: '2026-03-31',
      });
      expect(res.status).toBe(422);
    });

    it('janela acima de 180 dias → 422, API não é chamada', async () => {
      const res = await h.sincronizar({
        conta: 'GURU_PRD',
        dataInicio: '2026-01-01',
        dataFinal: '2026-12-31',
      });
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/180 dias/);
      expect(apiFake.chamadas).toHaveLength(0);
    });

    it('conta sem API configurada → 422, 0 eventos', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GURU_API_CLIENT)
        .useValue(new GuruApiClientIndisponivel())
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        const res = await request(app2.getHttpServer())
          .post('/ingestao/guru/sincronizar')
          .set(authHeader())
          .send({ conta: 'GURU_PRD', dataInicio: '2026-03-01', dataFinal: '2026-03-31' });
        expect(res.status).toBe(422);
        expect(
          await moduleRef.get(PrismaService).eventoOrigem.count({
            where: { plataformaOrigem: 'GURU_PRD' },
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
      const csv = fixtureCsv('export-vendas.csv');
      const r1 = await h.importarCsv('GURU_SVC', csv);
      expect(r1.status).toBe(200);
      expect(r1.body).toMatchObject({
        conta: 'GURU_SVC',
        linhas: 6,
        novos: 5,
        ignoradas: 1,
      });
      expect(r1.body.erros.join(' ')).toMatch(/sem identificador de transação/);

      const r2 = await h.importarCsv('GURU_SVC', csv);
      expect(r2.body.novos).toBe(0);
      expect(r2.body.dedup).toBe(5);
    });
  });

  // ------------------------------------------------------- isolamento de contas

  it('SC-015: mesmo transaction.id em /prd e /svc → 2 transações distintas', async () => {
    const body = fixture<Record<string, unknown>>('webhook-venda-approved.json');
    await h.postWebhook('GURU_PRD', body);
    await h.postWebhook('GURU_SVC', body);
    await h.processar();
    const txs = await prisma.transacao.findMany({
      where: { idOrigem: '9081534a-7512-4dab-9172-218c1dc10001' },
      orderBy: { plataformaOrigem: 'asc' },
    });
    expect(txs.map((t) => t.plataformaOrigem)).toEqual(['GURU_PRD', 'GURU_SVC']);
  });

  // ------------------------------------------------------- fronteira / regressão

  it('fronteira: adapters/guru não importa financeiro/clientes; status-map não importa ingestao', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync('grep', ['-rEl', proibido, alvo], { encoding: 'utf8' });
      } catch {
        return '';
      }
    };
    expect(grep('src/ingestao/adapters/guru', "from '.*/financeiro")).toBe('');
    expect(grep('src/ingestao/adapters/guru', "from '.*/clientes")).toBe('');
    expect(grep('src/ingestao/guru', "from '.*/financeiro")).toBe('');
    expect(grep('src/financeiro/domain/status-map', "from '.*/ingestao")).toBe('');
  });

  it('catálogo RBAC sem permissão nova; /health = 11 contextos', async () => {
    const perms = await http().get('/admin/rbac/permissoes').set(authHeader());
    const json = JSON.stringify(perms.body);
    expect(json).not.toMatch(/"guru:/);
    expect(json).toContain('evento:ingerir');

    const health = await http().get('/health');
    expect(health.body.contexts).toHaveLength(11);
  });
});
