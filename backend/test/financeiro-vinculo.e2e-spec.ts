import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { financeiroHelpers } from './support/financeiro';

/**
 * spec 024 — Vínculo Asaas↔Guru (e2e, Postgres real). Etapa 4 do pipeline
 * (`RESOLVER_VINCULO`) plugada de verdade — resolve nos 2 sentidos de chegada
 * (CL-02), pareamento restrito por conta (CL-01), regra de receita "só a Guru
 * soma" como filtro de leitura (CL-03). O laço de fundo do worker fica
 * desligado (`setup-db.ts`) — passadas via `POST /ingestao/eventos/processar`.
 */
describe('financeiro — vínculo Asaas↔Guru (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof financeiroHelpers>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = financeiroHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // `vinculo_transacao` tem FK `Restrict` para `transacao` — apaga primeiro.
    await prisma.vinculoTransacao.deleteMany({});
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
  });

  const rid = () => Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------------ migração

  it('migração criou `vinculo_transacao` + colunas novas em `transacao`', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'transacao'`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining(['referencia_externa_id_origem', 'transacao_vinculada_id']),
    );
    const vinculoCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'vinculo_transacao'`,
    );
    expect(vinculoCols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining([
        'transacao_guru_id',
        'transacao_asaas_id',
        'origem_ref',
        'resolvido_em',
      ]),
    );
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — Guru primeiro, Asaas chega depois', () => {
    it('vincula automaticamente e reclassifica a Asaas para COBRANCA_TERCEIRIZADA', async () => {
      const guruId = `guru_${rid()}`;
      const asaasId = `asaas_${rid()}`;

      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });
      const asaas = await h.ingerirEProcessar({
        plataformaOrigem: 'ASAAS_PRD',
        tipoOrigem: 'asaas.webhook',
        idOrigem: asaasId,
        canonicoOver: { referenciaExterna: { idOrigem: guruId } },
      });

      const guruTx = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'GURU_PRD', idOrigem: guruId } },
      });
      const asaasTx = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'ASAAS_PRD', idOrigem: asaasId } },
      });

      expect(asaasTx.transacaoVinculadaId).toBe(guruTx.id);
      expect(asaasTx.classificacao).toBe('COBRANCA_TERCEIRIZADA');

      const vinculos = await prisma.vinculoTransacao.findMany({
        where: { transacaoAsaasId: asaasTx.id },
      });
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0].transacaoGuruId).toBe(guruTx.id);
      expect(vinculos[0].origemRef).toBe(guruId);

      const detalhe = await h.detalhe(asaasTx.id);
      expect(detalhe.body.vinculoPendente).toBe(false);
      expect(detalhe.body.vinculo).toMatchObject({
        transacaoVinculadaId: guruTx.id,
        origemRef: guruId,
      });

      // reprocessar o mesmo evento Asaas não duplica o vínculo
      await h.reprocessar(asaas.eventoId, true);
      const vinculosDepois = await prisma.vinculoTransacao.findMany({
        where: { transacaoAsaasId: asaasTx.id },
      });
      expect(vinculosDepois).toHaveLength(1);
      expect(vinculosDepois[0].id).toBe(vinculos[0].id);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — Asaas primeiro, Guru chega depois', () => {
    it('fica pendente e resolve sozinho quando a Guru chega, sem endpoint manual', async () => {
      const guruId = `guru_${rid()}`;
      const asaasId = `asaas_${rid()}`;

      await h.ingerirEProcessar({
        plataformaOrigem: 'ASAAS_PRD',
        tipoOrigem: 'asaas.webhook',
        idOrigem: asaasId,
        canonicoOver: { referenciaExterna: { idOrigem: guruId } },
      });

      const pendenteAntes = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'ASAAS_PRD', idOrigem: asaasId } },
      });
      expect(pendenteAntes.transacaoVinculadaId).toBeNull();
      expect(pendenteAntes.classificacao).not.toBe('COBRANCA_TERCEIRIZADA');

      const listaPendentes = await h.listar('vinculoPendente=true&plataformaOrigem=ASAAS_PRD');
      expect(listaPendentes.status).toBe(200);
      expect(listaPendentes.body.itens.some((i: { id: string }) => i.id === pendenteAntes.id)).toBe(
        true,
      );

      const detalheAntes = await h.detalhe(pendenteAntes.id);
      expect(detalheAntes.body.vinculoPendente).toBe(true);
      expect(detalheAntes.body.vinculo).toBeNull();

      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });

      const depois = await prisma.transacao.findUniqueOrThrow({
        where: { id: pendenteAntes.id },
      });
      expect(depois.transacaoVinculadaId).not.toBeNull();
      expect(depois.classificacao).toBe('COBRANCA_TERCEIRIZADA');
    });
  });

  describe('US2b — pareamento de conta (CL-01)', () => {
    it('nunca casa Asaas PRD com Guru SVC; só resolve com a conta pareada', async () => {
      const guruId = `guru_${rid()}`;
      const asaasId = `asaas_${rid()}`;

      await h.ingerirEProcessar({
        plataformaOrigem: 'ASAAS_PRD',
        tipoOrigem: 'asaas.webhook',
        idOrigem: asaasId,
        canonicoOver: { referenciaExterna: { idOrigem: guruId } },
      });

      // a mesma id_origem existe do lado errado (SVC) — não deve casar
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_SVC',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });

      const asaasTx = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'ASAAS_PRD', idOrigem: asaasId } },
      });
      expect(asaasTx.transacaoVinculadaId).toBeNull();

      // agora materializa na conta certa (PRD) — deve casar com essa, não a SVC
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });

      const guruPrd = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'GURU_PRD', idOrigem: guruId } },
      });
      const guruSvc = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'GURU_SVC', idOrigem: guruId } },
      });
      const asaasDepois = await prisma.transacao.findUniqueOrThrow({
        where: { id: asaasTx.id },
      });
      expect(asaasDepois.transacaoVinculadaId).toBe(guruPrd.id);
      expect(asaasDepois.transacaoVinculadaId).not.toBe(guruSvc.id);
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — retry manual', () => {
    it('resolve sob demanda, é idempotente, e cobre os casos de borda', async () => {
      // pendente semeada direto no banco (fora do pipeline) + Guru já existente
      const guruId = `guru_${rid()}`;
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });
      const guruTx = await prisma.transacao.findUniqueOrThrow({
        where: { transacao_chave_natural: { plataformaOrigem: 'GURU_PRD', idOrigem: guruId } },
      });

      const asaasPendenteId = randomUUID();
      await prisma.transacao.create({
        data: {
          id: asaasPendenteId,
          plataformaOrigem: 'ASAAS_PRD',
          idOrigem: `asaas_${rid()}`,
          tipoOrigem: 'seed',
          statusOrigem: 'PAGO',
          statusCanonico: 'PAGO',
          classificacao: 'VENDA_PROPRIA',
          referenciaExternaIdOrigem: guruId,
        },
      });

      const r1 = await h.tentarVincular(asaasPendenteId);
      expect(r1.status).toBe(200);
      expect(r1.body.vinculado).toBe(true);
      expect(r1.body.transacaoVinculadaId).toBe(guruTx.id);

      // idempotente — não duplica nem desfaz
      const r2 = await h.tentarVincular(asaasPendenteId);
      expect(r2.status).toBe(200);
      expect(r2.body.vinculado).toBe(true);
      const vinculos = await prisma.vinculoTransacao.findMany({
        where: { transacaoAsaasId: asaasPendenteId },
      });
      expect(vinculos).toHaveLength(1);

      // sem par ainda → 200, vinculado:false
      const guruSemPar = `guru_sem_par_${rid()}`;
      const asaasSemParId = randomUUID();
      await prisma.transacao.create({
        data: {
          id: asaasSemParId,
          plataformaOrigem: 'ASAAS_SVC',
          idOrigem: `asaas_${rid()}`,
          tipoOrigem: 'seed',
          statusOrigem: 'PENDENTE',
          statusCanonico: 'PENDENTE',
          classificacao: 'VENDA_PROPRIA',
          referenciaExternaIdOrigem: guruSemPar,
        },
      });
      const r3 = await h.tentarVincular(asaasSemParId);
      expect(r3.status).toBe(200);
      expect(r3.body.vinculado).toBe(false);

      // plataforma não aplicável (TMB) → 422
      const tmbId = randomUUID();
      await prisma.transacao.create({
        data: {
          id: tmbId,
          plataformaOrigem: 'TMB',
          idOrigem: `tmb_${rid()}`,
          tipoOrigem: 'seed',
          statusOrigem: 'PAGO',
          statusCanonico: 'PAGO',
          classificacao: 'VENDA_PROPRIA',
        },
      });
      const r4 = await h.tentarVincular(tmbId);
      expect(r4.status).toBe(422);

      // id inexistente → 404
      const r5 = await h.tentarVincular(randomUUID());
      expect(r5.status).toBe(404);

      // bulk: cria mais 1 pendente resolvível + reusa a `asaasSemParId` (segue sem par)
      const guru2Id = `guru_${rid()}`;
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guru2Id,
      });
      const asaas2PendenteId = randomUUID();
      await prisma.transacao.create({
        data: {
          id: asaas2PendenteId,
          plataformaOrigem: 'ASAAS_PRD',
          idOrigem: `asaas_${rid()}`,
          tipoOrigem: 'seed',
          statusOrigem: 'PAGO',
          statusCanonico: 'PAGO',
          classificacao: 'VENDA_PROPRIA',
          referenciaExternaIdOrigem: guru2Id,
        },
      });

      const bulk = await h.tentarVincularPendentes();
      expect(bulk.status).toBe(200);
      expect(bulk.body.tentativas).toBeGreaterThanOrEqual(2);
      expect(bulk.body.resolvidos).toBeGreaterThanOrEqual(1);

      const asaas2Depois = await prisma.transacao.findUniqueOrThrow({
        where: { id: asaas2PendenteId },
      });
      expect(asaas2Depois.transacaoVinculadaId).not.toBeNull();
    });
  });

  // ------------------------------------------------------- regra de receita

  describe('regra de receita — "só a Guru soma"', () => {
    it('exclui a Asaas terceirizada de pagoDeFato; a Guru continua contando', async () => {
      const guruId = `guru_${rid()}`;
      const asaasId = `asaas_${rid()}`;
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: guruId,
      });
      await h.ingerirEProcessar({
        plataformaOrigem: 'ASAAS_PRD',
        tipoOrigem: 'asaas.webhook',
        idOrigem: asaasId,
        canonicoOver: { referenciaExterna: { idOrigem: guruId } },
      });

      const receitaAsaas = await h.listar(
        `pagoDeFato=true&plataformaOrigem=ASAAS_PRD&q=${asaasId}`,
      );
      expect(receitaAsaas.body.itens).toHaveLength(0);

      const receitaGuru = await h.listar(`pagoDeFato=true&plataformaOrigem=GURU_PRD&q=${guruId}`);
      expect(receitaGuru.body.itens).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ RBAC

  describe('RBAC', () => {
    it('403 nos 2 endpoints de escrita sem transacao:vincular; transacao:ver não basta', async () => {
      const { token } = await h.sujeitoCom(['transacao:ver']);
      const asaasId = randomUUID();
      await prisma.transacao.create({
        data: {
          id: asaasId,
          plataformaOrigem: 'ASAAS_PRD',
          idOrigem: `asaas_${rid()}`,
          tipoOrigem: 'seed',
          statusOrigem: 'PAGO',
          statusCanonico: 'PAGO',
          classificacao: 'VENDA_PROPRIA',
        },
      });

      const r1 = await h.tentarVincular(asaasId, token);
      expect(r1.status).toBe(403);
      const r2 = await h.tentarVincularPendentes(token);
      expect(r2.status).toBe(403);
    });

    it('200 com transacao:vincular', async () => {
      const { token } = await h.sujeitoCom(['transacao:ver', 'transacao:vincular']);
      const r = await h.tentarVincularPendentes(token);
      expect(r.status).toBe(200);
    });
  });

});
