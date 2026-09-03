import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { EtapaIngestao } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RegistrarEventoService } from '../src/ingestao/application/registrar-evento.service';
import { authHeader } from './support/auth';
import { userAuthHeader } from './support/auth';
import { ingestaoHelpers, montarEventoCanonico } from './support/ingestao';

/**
 * spec 006 — evento_origem e worker de ingestão (e2e, Postgres real).
 * Ingestão idempotente + dedup, worker em etapas com retry/bloqueio, classificação
 * honesta, painel + reprocessar, encaixe plugável das etapas 2–6, guard.
 * O laço de fundo do worker fica desligado (`setup-db.ts`) — as passadas são
 * disparadas por `POST /ingestao/eventos/processar`.
 */
describe('ingestao — evento_origem e worker (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let porta: RegistrarEventoService;
  let h: ReturnType<typeof ingestaoHelpers>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    porta = moduleRef.get(RegistrarEventoService);
    h = ingestaoHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    h.restaurarEtapas();
    // só esta suíte toca essas tabelas — deleteMany({}) é seguro.
    await prisma.ingestaoAudit.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
  });

  // ------------------------------------------------------------- ingestão

  describe('ingestão (etapa 0)', () => {
    it('POST novo → 201, criado:true, REGISTRAR=ok + 6 pendentes', async () => {
      const res = await h.ingerir({ idOrigem: 'txn_a' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ criado: true });
      const etapas = await prisma.eventoEtapa.findMany({
        where: { eventoOrigemId: res.body.eventoId },
      });
      expect(etapas).toHaveLength(7);
      expect(etapas.find((e) => e.etapa === EtapaIngestao.REGISTRAR)?.status).toBe('ok');
      expect(etapas.filter((e) => e.status === 'pendente')).toHaveLength(6);
    });

    it('reentrega idêntica → 200, criado:false, reentregas++ e payload intacto', async () => {
      const p = { id: 'txn_b', status: 'approved', valor: 100 };
      const r1 = await h.ingerir({ idOrigem: 'txn_b', payloadBruto: p });
      const r2 = await h.ingerir({ idOrigem: 'txn_b', payloadBruto: p });
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(200);
      expect(r2.body.eventoId).toBe(r1.body.eventoId);
      const ev = await prisma.eventoOrigem.findUnique({ where: { id: r1.body.eventoId } });
      expect(ev?.reentregas).toBe(1);
      expect(ev?.payloadBruto).toEqual(p);
      expect(await prisma.eventoOrigem.count()).toBe(1);
    });

    it('mesmo id_origem com payload diferente → 2 eventos', async () => {
      const a = await h.ingerir({ idOrigem: 'txn_c', payloadBruto: { v: 1 } });
      const b = await h.ingerir({ idOrigem: 'txn_c', payloadBruto: { v: 2 } });
      expect(a.body.eventoId).not.toBe(b.body.eventoId);
      expect(await prisma.eventoOrigem.count()).toBe(2);
    });

    it('idOrigem vazio / plataforma inválida / eventoCanonico inválido → 422', async () => {
      const base = { tipoOrigem: 'x', payloadBruto: { a: 1 } };
      await request(app.getHttpServer())
        .post('/ingestao/eventos')
        .set(authHeader())
        .send({ ...base, plataformaOrigem: 'GURU_PRD', idOrigem: '' })
        .expect(422);
      await request(app.getHttpServer())
        .post('/ingestao/eventos')
        .set(authHeader())
        .send({ ...base, plataformaOrigem: 'XPTO', idOrigem: 'a' })
        .expect(422);
      await request(app.getHttpServer())
        .post('/ingestao/eventos')
        .set(authHeader())
        .send({
          ...base,
          plataformaOrigem: 'GURU_PRD',
          idOrigem: 'a',
          eventoCanonico: { plataformaOrigem: 'GURU_PRD' },
        })
        .expect(422);
    });

    it('10 chamadas concorrentes com a mesma chave → 1 linha', async () => {
      const p = { id: 'txn_race', status: 'x' };
      await Promise.all(
        Array.from({ length: 10 }, () =>
          h.ingerir({ idOrigem: 'txn_race', payloadBruto: p }),
        ),
      );
      expect(await prisma.eventoOrigem.count()).toBe(1);
    });

    it('a porta in-process registra igual ao HTTP (idempotente)', async () => {
      const entrada = {
        plataformaOrigem: 'ASAAS_PRD' as const,
        tipoOrigem: 'api',
        idOrigem: 'porta_1',
        payloadBruto: { x: 1 },
      };
      const r1 = await porta.registrarEvento(entrada);
      const r2 = await porta.registrarEvento(entrada);
      expect(r1.criado).toBe(true);
      expect(r2).toEqual({ eventoId: r1.eventoId, criado: false });
    });

    it('sem token → 401; usuário sem perfil → 403', async () => {
      const usuario = await prisma.usuario.create({
        data: {
          id: randomUUID(),
          nome: 'Sem Perfil',
          email: 'semperfil-006@x.com',
          emailNormalizado: 'semperfil-006@x.com',
        },
      });
      await request(app.getHttpServer()).get('/ingestao/eventos').expect(401);
      await request(app.getHttpServer())
        .get('/ingestao/eventos')
        .set(userAuthHeader(usuario.id))
        .expect(403);
      await prisma.usuario.delete({ where: { id: usuario.id } });
    });

    it('não há rota /webhooks/* nesta spec', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/guru/prd')
        .expect((r) => expect([401, 404]).toContain(r.status));
    });
  });

  // --------------------------------------------------------------- worker

  describe('worker + etapas', () => {
    it('processa evento com canônico → ok, CLASSIFICAR ok, 2–6 pulada', async () => {
      const ev = await h.ingerir({ eventoCanonico: montarEventoCanonico() });
      const resumo = await h.processar();
      expect(resumo).toMatchObject({ selecionados: 1, ok: 1, erro: 0, revisar: 0 });
      const det = await h.detalhe(ev.body.eventoId);
      expect(det.body.status).toBe('ok');
      expect(det.body.classificacao).toBe('VENDA_PROPRIA');
      const puladas = det.body.etapas.filter(
        (e: { status: string }) => e.status === 'pulada',
      );
      expect(puladas).toHaveLength(5);
      expect(
        det.body.etapas.find((e: { etapa: string }) => e.etapa === 'RESOLVER_PESSOA')
          .resultado,
      ).toMatchObject({ implementadaNa: 18 });
    });

    it('idempotente: 2ª e 3ª passadas não selecionam nada', async () => {
      await h.ingerir({});
      await h.processar();
      expect((await h.processar()).selecionados).toBe(0);
      expect((await h.processar()).selecionados).toBe(0);
    });

    it('falha isolada: 3 eventos, 1 com etapa que falha → os outros 2 chegam a ok', async () => {
      const a = await h.ingerir({});
      const b = await h.ingerir({});
      const c = await h.ingerir({});
      const alvo = b.body.eventoId as string;
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_PESSOA, async (ctx) => {
        if (ctx.eventoId === alvo) throw new Error('falha determinística');
        return { status: 'pulada', resultado: { fake: true } };
      });
      await h.processar();
      const st = async (id: string) =>
        (await prisma.eventoOrigem.findUnique({ where: { id } }))?.status;
      expect(await st(a.body.eventoId)).toBe('ok');
      expect(await st(c.body.eventoId)).toBe('ok');
      expect(await st(alvo)).toBe('erro');
    });

    it('retry: etapa que falha 2× e passa na 3ª → tentativas 1→2→3, termina ok', async () => {
      const ev = await h.ingerir({});
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_PESSOA, h.etapaQueFalha(2));
      await h.processar();
      await h.processar();
      const meio = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.RESOLVER_PESSOA },
      });
      expect(meio?.tentativas).toBe(2);
      expect(meio?.status).toBe('erro');
      await h.processar();
      const fim = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.RESOLVER_PESSOA },
      });
      expect(fim?.status).toBe('ok');
      expect(fim?.tentativas).toBe(2);
      expect((await prisma.eventoOrigem.findUnique({ where: { id: ev.body.eventoId } }))?.status).toBe(
        'ok',
      );
    });

    it('falha determinística: após MAX tentativas fica erro terminal e não é mais tentada', async () => {
      const ev = await h.ingerir({});
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_PESSOA, async () => {
        throw new Error('sempre falha');
      });
      await h.processar();
      await h.processar();
      await h.processar();
      const t3 = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.RESOLVER_PESSOA },
      });
      expect(t3?.tentativas).toBe(3);
      expect((await h.processar()).selecionados).toBe(0); // esgotada — não elegível
      const t4 = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.RESOLVER_PESSOA },
      });
      expect(t4?.tentativas).toBe(3);
    });

    it('dependência em erro → etapa a jusante bloqueada; destrava ao ficar ok', async () => {
      const ev = await h.ingerir({});
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_PESSOA, h.etapaQueFalha(1));
      await h.processar();
      const upsert1 = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.UPSERT_TRANSACAO },
      });
      expect(upsert1?.status).toBe('bloqueada');
      await h.processar();
      const upsert2 = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.UPSERT_TRANSACAO },
      });
      expect(['ok', 'pulada']).toContain(upsert2?.status);
      expect((await prisma.eventoOrigem.findUnique({ where: { id: ev.body.eventoId } }))?.status).toBe(
        'ok',
      );
    });

    it('duas passadas concorrentes não processam o mesmo evento duas vezes', async () => {
      await h.ingerir({});
      let execs = 0;
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_PESSOA, async () => {
        execs += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { status: 'pulada', resultado: {} };
      });
      await Promise.all([h.processar(), h.processar()]);
      expect(execs).toBe(1);
    });
  });

  // --------------------------------------------------------- classificação

  describe('classificação (etapa 1)', () => {
    it('sem EventoCanonico → DESCONHECIDO + revisar + erro_detalhe', async () => {
      const ev = await h.ingerir({ comCanonico: false });
      await h.processar();
      const det = await h.detalhe(ev.body.eventoId);
      expect(det.body.status).toBe('revisar');
      expect(det.body.classificacao).toBe('DESCONHECIDO');
      expect(det.body.erroDetalhe).toMatch(/EventoCanonico/);
    });

    it('reembolso por tipo_origem → REEMBOLSO', async () => {
      const ev = await h.ingerir({
        tipoOrigem: 'webhook_reembolso',
        eventoCanonico: montarEventoCanonico({ tipoOrigem: 'webhook_reembolso' }),
      });
      await h.processar();
      const det = await h.detalhe(ev.body.eventoId);
      expect(det.body.classificacao).toBe('REEMBOLSO');
      expect(det.body.status).toBe('ok');
    });

    it('um evento em revisar não impede os outros de chegarem a ok', async () => {
      const bom = await h.ingerir({ eventoCanonico: montarEventoCanonico() });
      const ruim = await h.ingerir({ comCanonico: false });
      await h.processar();
      expect((await prisma.eventoOrigem.findUnique({ where: { id: bom.body.eventoId } }))?.status).toBe(
        'ok',
      );
      expect((await prisma.eventoOrigem.findUnique({ where: { id: ruim.body.eventoId } }))?.status).toBe(
        'revisar',
      );
    });
  });

  // ---------------------------------------------------------------- painel

  describe('painel + reprocessar', () => {
    it('lista default só revisar/erro; status=todos traz tudo; paginação', async () => {
      await h.ingerir({ eventoCanonico: montarEventoCanonico() }); // vira ok
      const rev = await h.ingerir({ comCanonico: false }); // vira revisar
      await h.processar();

      const def = await request(app.getHttpServer())
        .get('/ingestao/eventos')
        .set(authHeader());
      expect(def.body.itens.map((i: { id: string }) => i.id)).toEqual([rev.body.eventoId]);

      const todos = await request(app.getHttpServer())
        .get('/ingestao/eventos?status=todos')
        .set(authHeader());
      expect(todos.body.total).toBe(2);
      expect(todos.body.itens[0]).not.toHaveProperty('payloadBruto');
    });

    it('lista vazia → itens:[], total:0 (não erro)', async () => {
      const res = await request(app.getHttpServer())
        .get('/ingestao/eventos?status=todos')
        .set(authHeader());
      expect(res.body).toMatchObject({ itens: [], total: 0 });
    });

    it('detalhe traz payload_bruto e a linha do tempo das 7 etapas na ordem', async () => {
      const ev = await h.ingerir({ payloadBruto: { id: 'p1', v: 42 } });
      await h.processar();
      const det = await h.detalhe(ev.body.eventoId);
      expect(det.body.payloadBruto).toEqual({ id: 'p1', v: 42 });
      expect(det.body.etapas.map((e: { etapa: string }) => e.etapa)).toEqual([
        'REGISTRAR',
        'CLASSIFICAR',
        'RESOLVER_PESSOA',
        'UPSERT_TRANSACAO',
        'RESOLVER_VINCULO',
        'RESOLVER_OFERTA',
        'PROJETAR_CONTRATO',
      ]);
    });

    it('reprocessar um evento revisar → CLASSIFICAR volta a pendente, tentativas 0, 1 auditoria', async () => {
      const ev = await h.ingerir({ comCanonico: false });
      await h.processar();
      const res = await request(app.getHttpServer())
        .post(`/ingestao/eventos/${ev.body.eventoId}/reprocessar`)
        .set(authHeader())
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.etapasReenfileiradas).toContain('CLASSIFICAR');
      const cl = await prisma.eventoEtapa.findFirst({
        where: { eventoOrigemId: ev.body.eventoId, etapa: EtapaIngestao.CLASSIFICAR },
      });
      expect(cl?.status).toBe('pendente');
      expect(cl?.tentativas).toBe(0);
      expect(
        (await prisma.eventoOrigem.findUnique({ where: { id: ev.body.eventoId } }))?.status,
      ).toBe('pendente');
      const audit = await prisma.ingestaoAudit.findMany({
        where: { entidadeId: ev.body.eventoId },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ campo: 'reprocessar', origem: 'AJUSTE_MANUAL' });
    });

    it('reprocessar evento todo ok sem forcar → no-op, 0 auditoria', async () => {
      const ev = await h.ingerir({ eventoCanonico: montarEventoCanonico() });
      await h.processar();
      const res = await request(app.getHttpServer())
        .post(`/ingestao/eventos/${ev.body.eventoId}/reprocessar`)
        .set(authHeader())
        .send({});
      expect(res.body.etapasReenfileiradas).toEqual([]);
      expect(
        await prisma.ingestaoAudit.count({ where: { entidadeId: ev.body.eventoId } }),
      ).toBe(0);
    });

    it('reprocessar id inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post(`/ingestao/eventos/${randomUUID()}/reprocessar`)
        .set(authHeader())
        .send({})
        .expect(404);
    });

    it('guard: GET sem token → 401; reprocessar sem token → 401', async () => {
      await request(app.getHttpServer()).get('/ingestao/eventos').expect(401);
      await request(app.getHttpServer())
        .post(`/ingestao/eventos/${randomUUID()}/reprocessar`)
        .expect(401);
    });
  });

  // ------------------------------------------------------------- plugável

  describe('etapas 2–6 plugáveis (US5 / SC-012)', () => {
    it('2–6 são pulada com o nº da spec dona e não tocam outros contextos', async () => {
      const ev = await h.ingerir({});
      await h.processar();
      const det = await h.detalhe(ev.body.eventoId);
      const por = Object.fromEntries(
        det.body.etapas.map((e: { etapa: string; resultado: unknown }) => [
          e.etapa,
          e.resultado,
        ]),
      );
      expect(por.RESOLVER_PESSOA).toMatchObject({ implementadaNa: 18 });
      expect(por.UPSERT_TRANSACAO).toMatchObject({ implementadaNa: 18 });
      expect(por.RESOLVER_VINCULO).toMatchObject({ implementadaNa: 24 });
      expect(por.RESOLVER_OFERTA).toMatchObject({ implementadaNa: 23 });
      expect(por.PROJETAR_CONTRATO).toMatchObject({ implementadaNa: 25 });
    });

    it('uma etapa fake substituta é chamada pelo worker sem outra mudança', async () => {
      const ev = await h.ingerir({});
      let chamou = false;
      h.plugarEtapaFake(EtapaIngestao.RESOLVER_OFERTA, async () => {
        chamou = true;
        return { status: 'ok', resultado: { substituta: true } };
      });
      await h.processar();
      expect(chamou).toBe(true);
      const det = await h.detalhe(ev.body.eventoId);
      expect(
        det.body.etapas.find((e: { etapa: string }) => e.etapa === 'RESOLVER_OFERTA').resultado,
      ).toMatchObject({ substituta: true });
    });
  });
});
