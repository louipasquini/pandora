import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { contratosHelpers, TAG_CONTRATOS } from './support/contratos';
import { financeiroHelpers } from './support/financeiro';

/**
 * spec 025 — Contratos · Aditivos · Fold (e2e, Postgres real). Etapa 6 do
 * pipeline (`PROJETAR_CONTRATO`) plugada de verdade. O laço de fundo do
 * worker fica desligado (`setup-db.ts`) — passadas via
 * `POST /ingestao/eventos/processar`.
 */
describe('contratos — aditivos e fold (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof financeiroHelpers>;
  let c: ReturnType<typeof contratosHelpers>;
  let ofertaId: string;
  let produtoId: string;

  const rid = () => Math.random().toString(36).slice(2, 10);
  const emailPessoa = () => `contrato-${rid()}@example.com`;

  async function comprar(opts: {
    idOrigem: string;
    email: string;
    ocorridoEm: string;
    statusOrigem?: string;
  }) {
    return h.ingerirEProcessar({
      plataformaOrigem: 'GURU_PRD',
      tipoOrigem: 'guru.webhook',
      idOrigem: opts.idOrigem,
      // `payloadBruto` precisa variar entre 2 chamadas com o mesmo `idOrigem`
      // (ex.: pago -> estornado) — senão o hash de dedup (spec 006) trata a
      // 2ª como reentrega do mesmo evento e não cria uma `evento_origem` nova.
      payloadBruto: { id: opts.idOrigem, status: opts.statusOrigem ?? 'PAGO' },
      canonicoOver: {
        statusOrigem: opts.statusOrigem ?? 'PAGO',
        ocorridoEm: opts.ocorridoEm,
        comprador: { nome: 'Compradora Teste', emails: [opts.email] },
        oferta: { codigoOrigem: TAG_CONTRATOS, quantidade: 1 },
      },
    });
  }

  async function contratoDe(pessoaEmail: string) {
    const pessoa = await prisma.pessoa.findFirst({
      where: { emails: { some: { valor: pessoaEmail } } },
    });
    if (!pessoa) return null;
    return prisma.contrato.findUnique({
      where: { contrato_pessoa_produto: { pessoaId: pessoa.id, produtoId } },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = financeiroHelpers(app);
    c = contratosHelpers(app);

    // Bootstrap: 1ª venda com a tag dedicada cria produto+oferta (spec 023);
    // cura `tempo_acesso_dias` uma vez para toda a suíte, depois limpa esse
    // aditivo/contrato bootstrap (não faz parte de nenhum teste).
    const boot = await comprar({
      idOrigem: `boot_${rid()}`,
      email: emailPessoa(),
      ocorridoEm: new Date(Date.now() - 1000).toISOString(),
    });
    const produto = await prisma.produto.findUniqueOrThrow({ where: { codigo: 'CTR' } });
    const oferta = await prisma.oferta.findFirstOrThrow({ where: { produtoId: produto.id } });
    produtoId = produto.id;
    ofertaId = oferta.id;

    const cura = await c.curarTempoAcesso(ofertaId, 30);
    expect(cura.status).toBe(200);

    await prisma.contrato.deleteMany({});
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
    void boot;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.contrato.deleteMany({});
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
    await prisma.contratoAudit.deleteMany({});
  });

  // -------------------------------------------------------------- migração

  it('migração criou `contrato`/`aditivo`/`contrato_audit` e a FK de `transacao.contrato_id`', async () => {
    const contratoCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'contrato'`,
    );
    expect(contratoCols.map((c2) => c2.column_name)).toEqual(
      expect.arrayContaining([
        'fim_acesso',
        'ticket_total',
        'valor_recebido',
        'tolerancia_atraso_dias',
        'contrato_assinado',
        'ajuste_manual_status',
      ]),
    );
    const fks = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'transacao' AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(fks.some((f) => f.constraint_name.includes('contrato'))).toBe(true);
  });

  // ------------------------------------------------------------------ US1

  describe('US1 — estado de acesso derivado', () => {
    it('1ª compra vira COMPRA_INICIAL e o contrato fica ATIVO até fim_acesso', async () => {
      const email = emailPessoa();
      await comprar({
        idOrigem: `c1_${rid()}`,
        email,
        ocorridoEm: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 dias atrás
      });

      const contrato = await contratoDe(email);
      expect(contrato).not.toBeNull();
      expect(contrato!.fimAcesso).not.toBeNull();

      const det = await c.detalhe(contrato!.id);
      expect(det.status).toBe(200);
      expect(det.body.statusCanonico).toBe('ATIVO');
      expect(det.body.acessoLiberado).toBe(true);
      expect(det.body.aditivos).toHaveLength(1);
      expect(det.body.aditivos[0].rotulo).toBe('COMPRA_INICIAL');
    });

    it('sem nenhum aditivo novo, o status reflete o relógio (EXPIRADO) na leitura', async () => {
      const email = emailPessoa();
      await comprar({
        idOrigem: `c2_${rid()}`,
        email,
        ocorridoEm: '2020-01-01T00:00:00Z', // muito no passado — já expirou há muito
      });

      const contrato = await contratoDe(email);
      const det = await c.detalhe(contrato!.id);
      expect(det.body.statusCanonico).toBe('EXPIRADO');
      expect(det.body.acessoLiberado).toBe(false);
    });

    it('reprocessa depois da curadoria de tempo_acesso — nunca fica preso em revisão', async () => {
      // Simula chegar ANTES da curadoria estar pronta: cria uma oferta nova
      // (tag distinta, ainda sem tempo_acesso) e confirma que o aditivo nasce
      // em revisão sem travar as outras etapas, depois se resolve sozinho.
      const tagPropria = 'CTX00XAV';
      const email = emailPessoa();
      const idOrigem = `c3_${rid()}`;
      const ing = await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem,
        canonicoOver: {
          statusOrigem: 'PAGO',
          ocorridoEm: new Date().toISOString(),
          comprador: { nome: 'Compradora Teste', emails: [email] },
          oferta: { codigoOrigem: tagPropria, quantidade: 1 },
        },
      });

      const evento = await h.eventoDetalhe(ing.eventoId);
      const etapaContrato = evento.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'PROJETAR_CONTRATO',
      );
      expect(etapaContrato.resultado.motivoRevisao).toMatch(/tempo de acesso não cadastrado/);

      const produtoNovo = await prisma.produto.findUniqueOrThrow({ where: { codigo: 'CTX' } });
      const ofertaNova = await prisma.oferta.findFirstOrThrow({
        where: { produtoId: produtoNovo.id },
      });
      await c.curarTempoAcesso(ofertaNova.id, 15);

      await h.reprocessar(ing.eventoId, true);
      await h.processar();

      const pessoa = await prisma.pessoa.findFirstOrThrow({
        where: { emails: { some: { valor: email } } },
      });
      const contrato = await prisma.contrato.findUniqueOrThrow({
        where: { contrato_pessoa_produto: { pessoaId: pessoa.id, produtoId: produtoNovo.id } },
      });
      expect(contrato.fimAcesso).not.toBeNull();
      const det = await c.detalhe(contrato.id);
      expect(det.body.aditivos[0].rotulo).toBe('COMPRA_INICIAL');
      expect(det.body.aditivos[0].precisaRevisao).toBe(false);
    });
  });

  // ------------------------------------------------------------------ US2

  describe('US2 — renovar/prorrogar sem duplicar contrato', () => {
    it('2ª compra dentro do acesso ativo vira PRORROGACAO, 1 único contrato', async () => {
      const email = emailPessoa();
      const inicio = new Date(Date.now() - 5 * 86400000);
      await comprar({ idOrigem: `p1_${rid()}`, email, ocorridoEm: inicio.toISOString() });
      await comprar({
        idOrigem: `p2_${rid()}`,
        email,
        ocorridoEm: new Date(inicio.getTime() + 2 * 86400000).toISOString(), // 2 dias depois, ainda ativo (30d)
      });

      const contrato = await contratoDe(email);
      expect(contrato).not.toBeNull();

      const det = await c.detalhe(contrato!.id);
      expect(det.body.aditivos).toHaveLength(2);
      expect(det.body.aditivos[1].rotulo).toBe('PRORROGACAO');

      const listaMesmoContrato = await prisma.contrato.count({
        where: { pessoaId: contrato!.pessoaId, produtoId },
      });
      expect(listaMesmoContrato).toBe(1);
    });

    it('2ª compra depois de expirado vira RENOVACAO', async () => {
      const email = emailPessoa();
      await comprar({ idOrigem: `r1_${rid()}`, email, ocorridoEm: '2020-01-01T00:00:00Z' });
      await comprar({
        idOrigem: `r2_${rid()}`,
        email,
        ocorridoEm: new Date().toISOString(),
      });

      const contrato = await contratoDe(email);
      const det = await c.detalhe(contrato!.id);
      expect(det.body.aditivos).toHaveLength(2);
      expect(det.body.aditivos[1].rotulo).toBe('RENOVACAO');
      expect(det.body.statusCanonico).toBe('ATIVO');
    });

    it('reembolso reclassifica a mesma transação e sai de valor_recebido sem apagar o aditivo', async () => {
      const email = emailPessoa();
      const idOrigem = `e1_${rid()}`;
      await comprar({ idOrigem, email, ocorridoEm: new Date().toISOString() });

      const contratoAntes = await contratoDe(email);
      const detAntes = await c.detalhe(contratoAntes!.id);
      expect(detAntes.body.valorRecebido.BRL).toBeDefined();

      // mesma chave natural (plataforma+idOrigem) — upsert atualiza a MESMA transação.
      await comprar({ idOrigem, email, ocorridoEm: new Date().toISOString(), statusOrigem: 'Estornado' });

      const detDepois = await c.detalhe(contratoAntes!.id);
      expect(detDepois.body.valorRecebido.BRL).toBeUndefined();
      expect(detDepois.body.aditivos).toHaveLength(1);
      expect(detDepois.body.aditivos[0].rotulo).toBe('REEMBOLSO');
    });
  });

  // ------------------------------------------------------------------ US3

  describe('US3 — ajuste manual pontual', () => {
    it('PATCH sem motivo é rejeitado com 400', async () => {
      const email = emailPessoa();
      await comprar({ idOrigem: `m0_${rid()}`, email, ocorridoEm: '2020-01-01T00:00:00Z' });
      const contrato = await contratoDe(email);

      const r = await c.ajustar(contrato!.id, { ajusteManualStatus: 'ATIVO' });
      expect(r.status).toBe(400);
    });

    it('override vence na leitura até o próximo aditivo, que o limpa (mantendo a auditoria)', async () => {
      const email = emailPessoa();
      await comprar({ idOrigem: `m1_${rid()}`, email, ocorridoEm: '2020-01-01T00:00:00Z' });
      const contrato = await contratoDe(email);

      const antes = await c.detalhe(contrato!.id);
      expect(antes.body.statusCanonico).toBe('EXPIRADO');

      const patch = await c.ajustar(contrato!.id, {
        ajusteManualStatus: 'ATIVO',
        motivo: 'cortesia combinada com o suporte',
      });
      expect(patch.status).toBe(200);
      expect(patch.body.statusCanonico).toBe('ATIVO');

      const depoisPatch = await c.detalhe(contrato!.id);
      expect(depoisPatch.body.statusCanonico).toBe('ATIVO');
      expect(depoisPatch.body.ajusteManualStatus).toBe('ATIVO');

      // aditivo novo qualificado -> limpa o override (Regra Inviolável nº 13 / CL-01)
      await comprar({ idOrigem: `m2_${rid()}`, email, ocorridoEm: new Date().toISOString() });

      const depoisAditivo = await c.detalhe(contrato!.id);
      expect(depoisAditivo.body.ajusteManualStatus).toBeNull();
      expect(depoisAditivo.body.statusCanonico).toBe('ATIVO'); // agora derivado, não mais override

      const auditoria = await prisma.contratoAudit.findMany({ where: { entidadeId: contrato!.id } });
      expect(auditoria.some((a) => a.campo === 'ajusteManualStatus' && a.valorNovo === 'ATIVO')).toBe(
        true,
      );
    });

    it('tolerancia_atraso_dias e contrato_assinado são curados e não têm par derivado', async () => {
      const email = emailPessoa();
      await comprar({ idOrigem: `m3_${rid()}`, email, ocorridoEm: new Date().toISOString() });
      const contrato = await contratoDe(email);

      const r = await c.ajustar(contrato!.id, {
        toleranciaAtrasoDias: 5,
        contratoAssinado: true,
        motivo: 'contrato físico assinado, tolerância negociada',
      });
      expect(r.status).toBe(200);
      expect(r.body.toleranciaAtrasoDias).toBe(5);
      expect(r.body.contratoAssinado).toBe(true);

      // aditivo novo não limpa esses 2 campos (sem par derivado)
      await comprar({ idOrigem: `m4_${rid()}`, email, ocorridoEm: new Date().toISOString() });
      const depois = await c.detalhe(contrato!.id);
      expect(depois.body.toleranciaAtrasoDias).toBe(5);
      expect(depois.body.contratoAssinado).toBe(true);
    });
  });

  // -------------------------------------------------------------- Edge cases

  describe('edge cases', () => {
    it('oferta não resolvida -> aditivo pendente, sem criar contrato', async () => {
      const email = emailPessoa();
      const ing = await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: `x1_${rid()}`,
        canonicoOver: {
          statusOrigem: 'PAGO',
          ocorridoEm: new Date().toISOString(),
          comprador: { nome: 'Compradora Teste', emails: [email] },
          oferta: { codigoOrigem: 'texto sem tag alguma', quantidade: 1 },
        },
      });
      const evento = await h.eventoDetalhe(ing.eventoId);
      const etapaContrato = evento.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'PROJETAR_CONTRATO',
      );
      expect(etapaContrato.resultado.contratoId).toBeNull();
      expect(etapaContrato.resultado.motivo).toMatch(/oferta não resolvida/);

      const contrato = await contratoDe(email);
      expect(contrato).toBeNull();
    });

    it('venda como afiliada nunca gera contrato (etapa fica pulada)', async () => {
      const email = emailPessoa();
      const ing = await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem: `af1_${rid()}`,
        canonicoOver: {
          statusOrigem: 'PAGO',
          ocorridoEm: new Date().toISOString(),
          comprador: { nome: 'Compradora Teste', emails: [email] },
          ehAfiliada: true,
          oferta: { codigoOrigem: TAG_CONTRATOS, quantidade: 1 },
        },
      });
      const evento = await h.eventoDetalhe(ing.eventoId);
      const etapaContrato = evento.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'PROJETAR_CONTRATO',
      );
      expect(etapaContrato.status).toBe('pulada');

      const contrato = await contratoDe(email);
      expect(contrato).toBeNull();
    });

    it('GET /contratos filtra por produto/status e pagina', async () => {
      const email = emailPessoa();
      await comprar({ idOrigem: `l1_${rid()}`, email, ocorridoEm: new Date().toISOString() });

      const r = await c.listar(`produtoCodigo=CTR&status=ATIVO&pagina=1`);
      expect(r.status).toBe(200);
      expect(r.body.itens.length).toBeGreaterThan(0);
      expect(r.body.itens.every((i: { produto: { codigo: string } }) => i.produto.codigo === 'CTR')).toBe(
        true,
      );
    });

    it('RBAC: sem token -> 401; sem permissão -> 403', async () => {
      const r1 = await request(app.getHttpServer()).get('/contratos');
      expect(r1.status).toBe(401);

      const { token } = await h.sujeitoCom([]);
      const r2 = await c.listar('', token);
      expect(r2.status).toBe(403);
    });

    it('/health reporta os 11 contextos, `contratos` incluído', async () => {
      const r = await request(app.getHttpServer()).get('/health').set(authHeader());
      expect(r.body.contexts).toContain('contratos');
      expect(r.body.contexts).toHaveLength(11);
    });
  });
});
