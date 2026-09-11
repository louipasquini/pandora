import { execFileSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TMB_API_CLIENT } from '../src/ingestao/adapters/tmb';
import { authHeader } from './support/auth';
import {
  fixture,
  fixtureCsv,
  TmbApiClientFake,
  TmbApiClientIndisponivel,
  tmbHelpers,
} from './support/tmb';

/**
 * spec 019 — Adaptadores de borda da TMB (e2e, Postgres real).
 * Webhooks públicos Vendas/Financeiro → evento cru → worker → `transacao`
 * consolidada (1 por pedido, mesmo com N parcelas + 2 webhooks). Sincronização
 * por API (dublê) e import CSV. `status-map/tmb.ts` traduzido; bruto inédito →
 * revisão. Fronteira de contexto + não-regressão do pipeline.
 * O laço de fundo do worker fica desligado (`setup-db.ts`).
 */
describe('tmb — adaptadores de borda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof tmbHelpers>;
  const http = () => request(app.getHttpServer());

  const apiFake = new TmbApiClientFake([
    [fixture('api-pedidos-pagina.json')].flatMap(
      (p) => (p as { itens: unknown[] }).itens,
    ),
    [{ pedido_id: 777001, status_pedido: 'Efetivado', valor_principal: 100, criado_em: '2026-03-09T00:00:00-03:00' }],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TMB_API_CLIENT)
      .useValue(apiFake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = tmbHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    apiFake.chamadas.length = 0;
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
    // `RESOLVER_PESSOA` (018) cria `pessoa` a partir do comprador do fixture — as
    // fixtures usam CPFs/e-mails fixos que colidem com `clientes.e2e`. Remove só
    // as pessoas ancoradas na conta `TMB` (contatos em cascade). Não é
    // `pessoa.deleteMany({})` — outras suítes usam a tabela compartilhada.
    const refs = await prisma.pessoaOrigemRef.findMany({
      where: { plataformaOrigem: 'TMB' },
      select: { pessoaId: true },
    });
    const ids = [...new Set(refs.map((r) => r.pessoaId))];
    // `contrato` (025) tem FK `Restrict` para `pessoa` — apaga primeiro (cascade em `aditivo`).
    if (ids.length) await prisma.contrato.deleteMany({ where: { pessoaId: { in: ids } } });
    if (ids.length) await prisma.pessoa.deleteMany({ where: { id: { in: ids } } });
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — webhook de Vendas', () => {
    it('"Efetivado" + token → 202, 1 evento tmb.webhook-vendas, payload_bruto intacto', async () => {
      const body = fixture('webhook-vendas-efetivado.json');
      const res = await h.postVendas(body);
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ registrados: 1, ignorados: 0 });

      const ev = await prisma.eventoOrigem.findFirst({ where: { plataformaOrigem: 'TMB' } });
      expect(ev?.tipoOrigem).toBe('tmb.webhook-vendas');
      expect(ev?.idOrigem).toBe('483921');
      expect(ev?.payloadBruto).toEqual(body);
      expect(ev?.eventoCanonico).not.toBeNull();
    });

    it('processa → 1 transacao (TMB,483921) PAGO, pessoa resolvida', async () => {
      await h.postVendas(fixture('webhook-vendas-efetivado.json'));
      await h.processar();

      const txs = await prisma.transacao.findMany({ where: { plataformaOrigem: 'TMB' } });
      expect(txs).toHaveLength(1);
      expect(txs[0].idOrigem).toBe('483921');
      expect(txs[0].statusCanonico).toBe('PAGO');
      expect(txs[0].classificacao).toBe('VENDA_PROPRIA');
      expect(txs[0].pessoaId).not.toBeNull();
      // spec 023: RESOLVER_OFERTA agora é real; o título do pedido desta fixture
      // não carrega uma tag AEN decodificável -> revisão (Regra nº 15, nunca chuta).
      expect(txs[0].precisaRevisao).toBe(true);
    });

    it('"Cancelado" → transacao CANCELADO', async () => {
      await h.postVendas(fixture('webhook-vendas-cancelado.json'));
      await h.processar();
      const tx = await prisma.transacao.findFirst({ where: { idOrigem: '483922' } });
      expect(tx?.statusCanonico).toBe('CANCELADO');
    });

    it('sem token / token errado → 401, nenhum evento', async () => {
      const semToken = await h.postVendas(fixture('webhook-vendas-efetivado.json'), null);
      expect(semToken.status).toBe(401);
      const errado = await h.postVendas(fixture('webhook-vendas-efetivado.json'), 'nope');
      expect(errado.status).toBe(401);
      expect(await prisma.eventoOrigem.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — webhook Financeiro (nível de parcela)', () => {
    it('Vendas "Efetivado" + Financeiro "Estornado" mesmo pedido → 2 eventos, 1 transacao ESTORNADO/REEMBOLSO', async () => {
      await h.postVendas(fixture('webhook-vendas-efetivado.json'));
      const fin = await h.postFinanceiro([
        {
          dados: {
            pedido_id: 483921,
            status_pagamento: 'Estornado',
            cliente: 'Mariana Ferreira Lopes',
            cliente_email: 'mariana.lopes@example.invalid',
            data_pagamento: '2026-06-01T11:00:00',
          },
        },
      ]);
      expect(fin.status).toBe(202);
      await h.processar();

      const txs = await prisma.transacao.findMany({ where: { idOrigem: '483921' } });
      expect(txs).toHaveLength(1);
      expect(txs[0].statusCanonico).toBe('ESTORNADO');
      expect(txs[0].classificacao).toBe('REEMBOLSO');
      expect(await prisma.eventoOrigem.count({ where: { idOrigem: '483921' } })).toBe(2);
    });

    it('array de parcelas → N eventos, 1 transacao; reenviar → 0 novos (dedup por hash)', async () => {
      const parcelas = fixture('webhook-financeiro-parcelas.json');
      const r1 = await h.postFinanceiro(parcelas);
      expect(r1.body.registrados).toBe(5);
      const antes = await prisma.eventoOrigem.count();

      const r2 = await h.postFinanceiro(parcelas);
      expect(r2.status).toBe(202);
      expect(await prisma.eventoOrigem.count()).toBe(antes); // dedup

      await h.processar();
      expect(await prisma.transacao.count({ where: { idOrigem: '483921' } })).toBe(1);
    });

    it('array vazio → 202 { registrados: 0 }', async () => {
      const res = await h.postFinanceiro([]);
      expect(res.status).toBe(202);
      expect(res.body.registrados).toBe(0);
    });

    it('status_pagamento inédito → transacao DESCONHECIDO + revisão; evento revisar', async () => {
      await h.postFinanceiro([
        { dados: { pedido_id: 999321, status_pagamento: 'Xpto Novo' } },
      ]);
      await h.processar();
      const tx = await prisma.transacao.findFirst({ where: { idOrigem: '999321' } });
      expect(tx?.statusCanonico).toBe('DESCONHECIDO');
      expect(tx?.precisaRevisao).toBe(true);
      const ev = await prisma.eventoOrigem.findFirst({ where: { idOrigem: '999321' } });
      expect(ev?.status).toBe('revisar');
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — sincronização por API', () => {
    it('dublê de 2 páginas → resumo; re-disparo → novos: 0', async () => {
      const res = await h.sincronizar({ dataInicio: '2026-03-01', dataFinal: '2026-03-31' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ paginas: 2, dedup: 0, erros: [] });
      expect(res.body.novos).toBeGreaterThanOrEqual(3);
      expect(apiFake.chamadas[0]).toMatchObject({ dataInicio: '2026-03-01', pageNumber: 1 });

      const novos1 = res.body.novos;
      const res2 = await h.sincronizar({ dataInicio: '2026-03-01', dataFinal: '2026-03-31' });
      expect(res2.body.novos).toBe(0);
      expect(res2.body.dedup).toBe(novos1);
    });

    it('conta TMB sem API configurada → 422, 0 eventos', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(TMB_API_CLIENT)
        .useValue(new TmbApiClientIndisponivel())
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        const res = await request(app2.getHttpServer())
          .post('/ingestao/tmb/sincronizar')
          .set(authHeader())
          .send({});
        expect(res.status).toBe(422);
        expect(await moduleRef.get(PrismaService).eventoOrigem.count()).toBe(0);
      } finally {
        await app2.close();
      }
    });
  });

  // ---------------------------------------------------------------- US4

  describe('US4 — import CSV', () => {
    it('5 linhas (4 boas + 1 sem pedido) → 200 { novos: 4, ignoradas: 1 }; 2º import → novos: 0', async () => {
      const csv = fixtureCsv('export-pedidos.csv');
      const r1 = await h.importarCsv(csv);
      expect(r1.status).toBe(200);
      expect(r1.body).toMatchObject({ linhas: 5, novos: 4, ignoradas: 1 });
      expect(r1.body.erros.join(' ')).toMatch(/sem identificador de pedido/);

      const r2 = await h.importarCsv(csv);
      expect(r2.body.novos).toBe(0);
      expect(r2.body.dedup).toBe(4);
    });
  });

  // ------------------------------------------------------- fronteira / regressão

  it('fronteira: adapters/tmb não importa financeiro; status-map não importa ingestao', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync('grep', ['-rEl', proibido, alvo], { encoding: 'utf8' });
      } catch {
        return '';
      }
    };
    expect(grep('src/ingestao/adapters/tmb', "from '.*/financeiro")).toBe('');
    expect(grep('src/ingestao/tmb', "from '.*/financeiro")).toBe('');
    expect(grep('src/financeiro/domain/status-map', "from '.*/ingestao")).toBe('');
  });

  it('catálogo RBAC sem permissão nova; /health = 11 contextos', async () => {
    const perms = await http().get('/admin/rbac/permissoes').set(authHeader());
    const json = JSON.stringify(perms.body);
    expect(json).not.toMatch(/"tmb:/);
    expect(json).toContain('evento:ingerir');

    const health = await http().get('/health');
    expect(health.body.contexts).toHaveLength(11);
  });
});
