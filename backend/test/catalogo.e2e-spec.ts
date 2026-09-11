import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { catalogoHelpers } from './support/catalogo';
import { financeiroHelpers, montarCanonico } from './support/financeiro';

/**
 * spec 023 — Catálogo (`produto` -> `oferta`, e2e, Postgres real). Etapa 5 do
 * pipeline canônico plugada de verdade (`RESOLVER_OFERTA`): decodificador de
 * tag AEN (5 contas não-Hotmart), catálogo importado por CSV (2 contas
 * Hotmart), precedência curado > derivado > null, curadoria manual. O laço de
 * fundo do worker fica desligado (`setup-db.ts`) — passadas via
 * `POST /ingestao/eventos/processar`.
 */
describe('catalogo — produto/oferta (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof financeiroHelpers>;
  let c: ReturnType<typeof catalogoHelpers>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = financeiroHelpers(app);
    c = catalogoHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // `catalogo` (023) + `financeiro`/`ingestao` são os únicos escritores
    // destas tabelas; suíte roda serial (maxWorkers:1) — deleteMany é seguro.
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
    await prisma.catalogoAudit.deleteMany({});
    await prisma.ofertaCatalogoBonus.deleteMany({});
    await prisma.ofertaCatalogoComboItem.deleteMany({});
    await prisma.ofertaCatalogo.deleteMany({});
    await prisma.ofertaOrigemRef.deleteMany({});
    await prisma.oferta.deleteMany({});
    await prisma.janelaLancamento.deleteMany({});
    await prisma.produto.deleteMany({});
  });

  // ---------------------------------------------------------- migração

  it('migração criou as 8 tabelas + FK transacao.oferta_id -> oferta.id', async () => {
    const tabelas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
    );
    const nomes = tabelas.map((t) => t.table_name);
    for (const t of [
      'produto',
      'oferta',
      'oferta_origem_ref',
      'oferta_catalogo',
      'oferta_catalogo_bonus',
      'oferta_catalogo_combo_item',
      'janela_lancamento',
      'catalogo_audit',
    ]) {
      expect(nomes).toContain(t);
    }

    const fks = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'transacao' AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(fks.map((f) => f.constraint_name)).toContain('transacao_oferta_id_fkey');
  });

  // -------------------------------------------------------------- US1

  describe('US1 — resolução automática por tag / catálogo', () => {
    it('Guru: tag ancorada em codigoOrigem cria produto + oferta + origem_ref', async () => {
      const t = 'PCS48XAV';
      const { resumo, idOrigem } = await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        canonicoOver: { oferta: { codigoOrigem: t, quantidade: 1 } },
      });
      expect(resumo.selecionados).toBeGreaterThanOrEqual(1);

      const produto = await c.produtoPorCodigo('PCS');
      expect(produto.status).toBe(200);
      expect(produto.body.nome).toBeNull();

      const ofertas = await c.listarOfertas('produtoCodigo=PCS');
      expect(ofertas.body.total).toBe(1);
      const oferta = ofertas.body.itens[0];
      expect(oferta.turma).toEqual({ tipo: 'NUMERO', numero: 48 });
      expect(oferta.origensRef).toEqual([
        { plataformaOrigem: 'GURU_PRD', tipoRef: 'TAG', valorRef: t },
      ]);

      const tx = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'GURU_PRD', idOrigem },
      });
      expect(tx?.ofertaId).toBe(oferta.id);
      expect(tx?.precisaRevisao).toBe(false);
    });

    it('2ª venda com a mesma tag/plataforma resolve pro mesmo registro (idempotência)', async () => {
      const t = 'PCS48XAV';
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g1',
        canonicoOver: { oferta: { codigoOrigem: t } },
      });
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g2',
        canonicoOver: { oferta: { codigoOrigem: t } },
      });

      expect(await prisma.produto.count({ where: { codigo: 'PCS' } })).toBe(1);
      expect(await prisma.oferta.count()).toBe(1);

      const tx1 = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'GURU_PRD', idOrigem: 'g1' },
      });
      const tx2 = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'GURU_PRD', idOrigem: 'g2' },
      });
      expect(tx1?.ofertaId).toBe(tx2?.ofertaId);
    });

    it('mesma tag comercial em Hotmart (via catálogo) gera um 2º registro de oferta distinto', async () => {
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-cross',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });

      const csv = 'price_code,produto_codigo,tag\nHP001,PCS,PCS48XAV\n';
      const imp = await c.importarOfertasCsv(csv, 'HOTMART_PRD');
      expect(imp.status).toBe(201);
      expect(imp.body).toEqual({ processadas: 1, criadas: 1, atualizadas: 0, ignoradas: 0 });

      await h.ingerirEProcessar({
        plataformaOrigem: 'HOTMART_PRD',
        idOrigem: 'h-cross',
        tipoOrigem: 'hotmart.api',
        canonicoOver: { oferta: { codigoOrigem: 'HP001' } },
      });

      expect(await prisma.produto.count({ where: { codigo: 'PCS' } })).toBe(1);
      expect(await prisma.oferta.count()).toBe(2);

      const txGuru = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'GURU_PRD', idOrigem: 'g-cross' },
      });
      const txHotmart = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'HOTMART_PRD', idOrigem: 'h-cross' },
      });
      expect(txGuru?.ofertaId).not.toBe(txHotmart?.ofertaId);
    });

    it('Asaas: tag em texto livre (nomeOrigem) resolve; turma perpétua (00)', async () => {
      const { idOrigem } = await h.ingerirEProcessar({
        plataformaOrigem: 'ASAAS_PRD',
        canonicoOver: {
          oferta: { nomeOrigem: 'Mensalidade Programa Consultório - #PCS00LAV' },
        },
      });
      const tx = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'ASAAS_PRD', idOrigem },
        include: { oferta: true },
      });
      expect(tx?.oferta?.turmaTipoDerivado).toBe('PERPETUO');
      expect(tx?.precisaRevisao).toBe(false);
    });

    it('TMB sem tag reconhecível -> oferta_id null + precisaRevisao', async () => {
      const { idOrigem } = await h.ingerirEProcessar({
        plataformaOrigem: 'TMB',
        tipoOrigem: 'tmb.webhook-vendas',
        canonicoOver: { oferta: { nomeOrigem: 'Pedido avulso sem identificação de oferta' } },
      });
      const tx = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'TMB', idOrigem },
      });
      expect(tx?.ofertaId).toBeNull();
      expect(tx?.precisaRevisao).toBe(true);
      expect(tx?.motivoRevisao).toMatch(/tag de oferta não localizada/);
    });

    it('venda Hotmart sem price_code catalogado -> oferta_id null + revisão (nunca cai pra tag)', async () => {
      const { idOrigem } = await h.ingerirEProcessar({
        plataformaOrigem: 'HOTMART_PRD',
        tipoOrigem: 'hotmart.api',
        canonicoOver: { oferta: { codigoOrigem: 'HPXXXX', nomeOrigem: '#PCS48XAV' } },
      });
      const tx = await prisma.transacao.findFirst({
        where: { plataformaOrigem: 'HOTMART_PRD', idOrigem },
      });
      expect(tx?.ofertaId).toBeNull();
      expect(tx?.precisaRevisao).toBe(true);
      expect(tx?.motivoRevisao).toMatch(/não catalogado/);
      expect(await prisma.produto.count({ where: { codigo: 'PCS' } })).toBe(0);
    });

    it('reprocessar um evento já resolvido é idempotente (0 duplicata)', async () => {
      const { eventoId } = await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-reproc',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });
      await h.reprocessar(eventoId, true);
      expect(await prisma.oferta.count()).toBe(1);
      expect(await prisma.produto.count()).toBe(1);
    });
  });

  // -------------------------------------------------------------- US2

  describe('US2 — curadoria de produto e oferta', () => {
    it('PUT /produtos/:codigo cura nome/assinatura e audita; sobrevive a nova venda', async () => {
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-cur1',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });

      const put = await c.curarProduto('PCS', {
        nome: 'Programa Consultório Smart',
        assinatura: false,
      });
      expect(put.status).toBe(200);
      expect(put.body.nome).toBe('Programa Consultório Smart');

      const audits = await prisma.catalogoAudit.findMany({ where: { entidade: 'produto' } });
      expect(audits.length).toBe(2); // nome + assinatura

      // nova venda da mesma tag não sobrescreve o nome curado
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-cur2',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });
      const produto = await c.produtoPorCodigo('PCS');
      expect(produto.body.nome).toBe('Programa Consultório Smart');
    });

    it('PATCH /ofertas/:id grava oferta_catalogo + bônus + combo', async () => {
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-cat1',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });
      const lista = await c.listarOfertas('produtoCodigo=PCS');
      const ofertaId = lista.body.itens[0].id as string;

      const outroProduto = await prisma.produto.create({
        data: { id: randomUUID(), codigo: 'NMX' },
      });

      const patch = await c.curarOferta(ofertaId, {
        catalogo: {
          ticket: { valorInt: '19700000', moeda: 'BRL' },
          tempoAcessoDias: 365,
          bonus: ['Ebook X', 'Mentoria Y'],
          produtosDoComboIds: [outroProduto.id],
          combo: true,
        },
      });
      expect(patch.status).toBe(200);
      expect(patch.body.catalogo.ticket).toEqual({ valorInt: '19700000', moeda: 'BRL' });
      expect(patch.body.catalogo.bonus).toEqual(['Ebook X', 'Mentoria Y']);
      expect(patch.body.catalogo.produtosDoComboIds).toEqual([outroProduto.id]);
      expect(patch.body.catalogo.combo).toBe(true);
    });

    it('PATCH /ofertas/:id com produtosDoComboIds inexistente -> 400 (nenhuma escrita parcial)', async () => {
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'g-cat2',
        canonicoOver: { oferta: { codigoOrigem: 'PCS48XAV' } },
      });
      const lista = await c.listarOfertas('produtoCodigo=PCS');
      const ofertaId = lista.body.itens[0].id as string;

      const patch = await c.curarOferta(ofertaId, {
        catalogo: { produtosDoComboIds: [randomUUID()] },
      });
      expect(patch.status).toBe(400);
    });

    it('POST /ofertas com produtoId inexistente -> 404', async () => {
      const r = await c.criarOferta({ produtoId: randomUUID() });
      expect(r.status).toBe(404);
    });
  });

  // -------------------------------------------------------------- US3

  describe('US3 — import do catálogo Hotmart', () => {
    it('importa produtos.csv válido', async () => {
      const csv = 'codigo,nome,assinatura\nPCS,Programa Consultório Smart,não\nNMX,Nutrição Max,sim\n';
      const r = await c.importarProdutosCsv(csv);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ processadas: 2, criadas: 2, atualizadas: 0, ignoradas: 0 });

      const pcs = await c.produtoPorCodigo('PCS');
      expect(pcs.body.nome).toBe('Programa Consultório Smart');
      expect(pcs.body.assinatura).toBe(false);
    });

    it('produtos.csv sem coluna obrigatória -> 422 atômico (0 linha gravada)', async () => {
      const csv = 'nome\nPrograma\n';
      const r = await c.importarProdutosCsv(csv);
      expect(r.status).toBe(422);
      expect(r.body.erro).toBe('schema_invalido');
      expect(await prisma.produto.count()).toBe(0);
    });

    it('ofertas.csv: linha sem price_code é ignorada, resto processado', async () => {
      const csv = 'price_code,produto_codigo\nHP1,PCS\n,NMX\n';
      const r = await c.importarOfertasCsv(csv, 'HOTMART_PRD');
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ processadas: 2, criadas: 1, atualizadas: 0, ignoradas: 1 });
    });

    it('lancamentos.csv resolve turma efetiva por data', async () => {
      await c.importarProdutosCsv('codigo,nome\nPCS,Programa\n');
      const csv =
        'produto_codigo,rotulo,inicio,fim\nPCS,Turma 50,2026-10-01,2026-10-15\n';
      const r = await c.importarLancamentosCsv(csv);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ processadas: 1, criadas: 1, atualizadas: 0, ignoradas: 0 });

      const produto = await prisma.produto.findUniqueOrThrow({ where: { codigo: 'PCS' } });
      const janelas = await prisma.janelaLancamento.findMany({ where: { produtoId: produto.id } });
      expect(janelas).toHaveLength(1);
      expect(janelas[0].rotulo).toBe('Turma 50');
    });
  });

  // ------------------------------------------------------- concorrência

  it('2 passadas concorrentes sobre o mesmo evento não duplicam a oferta', async () => {
    const idOrigem = 'g-concorrente';
    await http()
      .post('/ingestao/eventos')
      .set(authHeader())
      .send({
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem,
        payloadBruto: { id: idOrigem },
        eventoCanonico: montarCanonico({
          plataformaOrigem: 'GURU_PRD',
          idOrigem,
          oferta: { codigoOrigem: 'PCS48XAV' },
        }),
      });
    await Promise.all([h.processar(), h.processar()]);
    expect(await prisma.oferta.count()).toBe(1);
  });

  // ------------------------------------------------------------- guard

  describe('guard + catálogo RBAC', () => {
    it('sem token -> 401', async () => {
      await http().get('/produtos').expect(401);
      await http().get('/ofertas').expect(401);
      await http().post('/catalogo/hotmart/importar-produtos').send({ csv: 'x' }).expect(401);
    });

    it('autenticado sem produto:ver/oferta:ver -> 403', async () => {
      const { token } = await h.sujeitoCom([]);
      const auth = { Authorization: `Bearer ${token}` };
      expect((await http().get('/produtos').set(auth)).status).toBe(403);
      expect((await http().get('/ofertas').set(auth)).status).toBe(403);
    });

    it('sujeito com produto:ver/oferta:ver -> 200; credencial de serviço -> 2xx', async () => {
      const { token } = await h.sujeitoCom(['produto:ver', 'oferta:ver']);
      const auth = { Authorization: `Bearer ${token}` };
      expect((await http().get('/produtos').set(auth)).status).toBe(200);
      expect((await http().get('/ofertas').set(auth)).status).toBe(200);
      expect((await http().get('/produtos').set(authHeader())).status).toBe(200);
    });

    it('GET /admin/rbac/permissoes inclui produto/oferta; efetivas da credencial de serviço também', async () => {
      const cat = await http().get('/admin/rbac/permissoes').set(authHeader());
      const ids = cat.body.recursos.flatMap((g: { permissoes: { id: string }[] }) =>
        g.permissoes.map((p) => p.id),
      );
      for (const id of ['produto:ver', 'produto:editar', 'oferta:ver', 'oferta:criar', 'oferta:editar']) {
        expect(ids).toContain(id);
      }
      const ef = await http().get('/auth/permissoes-efetivas').set(authHeader());
      expect(ef.body.permissoes).toContain('oferta:editar');
    });
  });

  // ----------------------------------------------------------- fronteira

  it('fronteira: `src/catalogo` não importa `ingestao`/`financeiro`/`clientes`; eles não importam `catalogo`', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync(
          'grep',
          ['-rEl', `from ['"].*/${proibido}/`, `src/${alvo}`],
          { cwd: process.cwd(), encoding: 'utf8' },
        ).trim();
      } catch {
        return '';
      }
    };
    expect(grep('catalogo', 'ingestao')).toBe('');
    expect(grep('catalogo', 'financeiro')).toBe('');
    expect(grep('catalogo', 'clientes')).toBe('');
    expect(grep('ingestao', 'catalogo')).toBe('');
    expect(grep('financeiro', 'catalogo')).toBe('');
  });

  // ------------------------------------------------------------ health

  it('/health segue reportando os 11 contextos', async () => {
    const r = await http().get('/health');
    expect(r.status).toBe(200);
    expect(r.body.contexts).toHaveLength(11);
  });
});
