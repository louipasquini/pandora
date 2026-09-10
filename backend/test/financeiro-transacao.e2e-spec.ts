import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { financeiroHelpers, montarCanonico } from './support/financeiro';

/**
 * spec 018 — Financeiro · ledger de transações (e2e, Postgres real).
 * Etapas 2–3 do pipeline canônico plugadas de verdade: `RESOLVER_PESSOA` (reusa
 * a engine da 005 pela `PortaIdentidade`) e `UPSERT_TRANSACAO` (`transacao`
 * normalizada, 1 por `(plataforma_origem, id_origem)`). Idempotência, afiliada
 * sem cliente novo, status bruto não catalogado → revisão, painel + guard.
 * O laço de fundo do worker fica desligado (`setup-db.ts`) — passadas via
 * `POST /ingestao/eventos/processar`.
 */
describe('financeiro — ledger de transações (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof financeiroHelpers>;
  const http = () => request(app.getHttpServer());

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
    await prisma.transacao.deleteMany({});
    await prisma.eventoEtapa.deleteMany({});
    await prisma.eventoOrigem.deleteMany({});
    // pessoas criadas pela etapa 2
    await prisma.pessoaOrigemRef.deleteMany({});
    await prisma.pessoaEmail.deleteMany({});
    await prisma.pessoaTelefone.deleteMany({});
    await prisma.pessoaDocumento.deleteMany({});
    await prisma.pessoa.deleteMany({});
  });

  // ------------------------------------------------------------ migração

  it('migração criou `transacao` + enum; @@unique(plataforma_origem,id_origem)', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'transacao'`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining([
        'plataforma_origem',
        'id_origem',
        'status_canonico',
        'valor_bruto_int',
        'valor_bruto_moeda',
        'precisa_revisao',
        'evento_origem_id',
      ]),
    );
    await h.ingerirEProcessar({ idOrigem: 'dup_1' });
    await expect(
      prisma.transacao.create({
        data: {
          id: randomUUID(),
          plataformaOrigem: 'GURU_PRD',
          idOrigem: 'dup_1',
          tipoOrigem: 'x',
          statusOrigem: 'PAGO',
          statusCanonico: 'PAGO',
          classificacao: 'VENDA_PROPRIA',
        },
      }),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------- US1

  describe('US1 — evento vira transação normalizada', () => {
    it('venda própria → 1 transação com campos normalizados; etapa 3 ok/foi_criada', async () => {
      const { eventoId, idOrigem } = await h.ingerirEProcessar({
        canonicoOver: {
          valores: {
            bruto: { valorInteiro: '19700000', moeda: 'BRL' },
            liquido: { valorInteiro: '18500000', moeda: 'BRL' },
          },
        },
      });

      const lista = await h.listar('plataformaOrigem=GURU_PRD');
      expect(lista.status).toBe(200);
      expect(lista.body.total).toBe(1);
      const t = lista.body.itens[0];
      expect(t).toMatchObject({
        plataformaOrigem: 'GURU_PRD',
        idOrigem,
        statusCanonico: 'PAGO',
        classificacao: 'VENDA_PROPRIA',
        ehAfiliada: false,
        precisaRevisao: false,
        valorBruto: { valorInt: '19700000', moeda: 'BRL' },
      });
      expect(t.pessoaId).toEqual(expect.any(String));

      const ev = await h.eventoDetalhe(eventoId);
      const upsert = ev.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'UPSERT_TRANSACAO',
      );
      expect(upsert.status).toBe('ok');
      expect(upsert.resultado).toMatchObject({ foi_criada: true });
      expect(upsert.resultado.campos_alterados).toEqual(
        expect.arrayContaining(['statusCanonico', 'valorBruto']),
      );
    });

    it('2º evento p/ a mesma chave com valor diferente → mesma linha, campos_alterados=["valorBruto"]', async () => {
      await h.ingerirEProcessar({
        idOrigem: 'txn_upd',
        canonicoOver: { valores: { bruto: { valorInteiro: '10000000', moeda: 'BRL' } } },
      });
      const antes = await prisma.transacao.count();

      // hash diferente (payload diferente) → novo evento_origem para a mesma chave de transacao
      const seg = await h.ingerirEProcessar({
        idOrigem: 'txn_upd',
        payloadBruto: { id: 'txn_upd', v: 2 },
        canonicoOver: { valores: { bruto: { valorInteiro: '12500000', moeda: 'BRL' } } },
      });

      expect(await prisma.transacao.count()).toBe(antes); // não duplicou
      const t = await prisma.transacao.findFirst({ where: { idOrigem: 'txn_upd' } });
      expect(t?.valorBrutoInt).toBe(12500000n);

      const ev = await h.eventoDetalhe(seg.eventoId);
      const upsert = ev.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'UPSERT_TRANSACAO',
      );
      expect(upsert.resultado).toMatchObject({ foi_criada: false });
      expect(upsert.resultado.campos_alterados).toEqual(['valorBruto']);
    });

    it('sem comprador → RESOLVER_PESSOA ok com pessoaId null; transação com pessoa_id null', async () => {
      const { eventoId } = await h.ingerirEProcessar({
        canonicoOver: { comprador: undefined },
      });
      const ev = await h.eventoDetalhe(eventoId);
      const rp = ev.body.etapas.find((e: { etapa: string }) => e.etapa === 'RESOLVER_PESSOA');
      expect(rp.status).toBe('ok');
      expect(rp.resultado).toMatchObject({ pessoaId: null });
      const t = await prisma.transacao.findFirst();
      expect(t?.pessoaId).toBeNull();
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — resolver a pessoa do comprador', () => {
    it('2 eventos de contas diferentes, mesmo e-mail → 1 pessoa, 2 transações', async () => {
      await h.ingerirEProcessar({
        plataformaOrigem: 'GURU_PRD',
        idOrigem: 'a1',
        canonicoOver: { comprador: { nome: 'X', emails: ['mesmo@example.com'] } },
      });
      await h.ingerirEProcessar({
        plataformaOrigem: 'HOTMART_PRD',
        tipoOrigem: 'hotmart.api',
        idOrigem: 'b1',
        canonicoOver: { comprador: { nome: 'X', emails: ['mesmo@example.com'] } },
      });

      const pessoas = await prisma.pessoa.findMany();
      expect(pessoas).toHaveLength(1);
      const ts = await prisma.transacao.findMany();
      expect(ts).toHaveLength(2);
      expect(new Set(ts.map((t) => t.pessoaId))).toEqual(new Set([pessoas[0].id]));
      const refs = await prisma.pessoaOrigemRef.findMany({
        where: { pessoaId: pessoas[0].id },
      });
      expect(new Set(refs.map((r) => r.plataformaOrigem))).toEqual(
        new Set(['GURU_PRD', 'HOTMART_PRD']),
      );
    });

    it('afiliada + comprador desconhecido → pessoaId null, count(pessoa) inalterado', async () => {
      const antes = await prisma.pessoa.count();
      const { eventoId } = await h.ingerirEProcessar({
        canonicoOver: {
          ehAfiliada: true,
          comprador: { nome: 'Nova Pessoa', emails: ['afiliada-nova@example.com'] },
        },
      });
      expect(await prisma.pessoa.count()).toBe(antes);
      const ev = await h.eventoDetalhe(eventoId);
      const rp = ev.body.etapas.find((e: { etapa: string }) => e.etapa === 'RESOLVER_PESSOA');
      expect(rp.status).toBe('ok');
      expect(rp.resultado).toMatchObject({ pessoaId: null });
      const t = await prisma.transacao.findFirst();
      expect(t).toMatchObject({ ehAfiliada: true, pessoaId: null, classificacao: 'VENDA_AFILIADA' });
    });

    it('afiliada + comprador já existente → transação liga à pessoa (sem oferta/contrato)', async () => {
      // 1) venda própria cria a pessoa
      await h.ingerirEProcessar({
        idOrigem: 'own_1',
        canonicoOver: { comprador: { nome: 'Recorrente', emails: ['recorrente@example.com'] } },
      });
      const pessoa = await prisma.pessoa.findFirst();

      // 2) venda de afiliada com o mesmo e-mail
      await h.ingerirEProcessar({
        plataformaOrigem: 'HOTMART_PRD',
        tipoOrigem: 'hotmart.api',
        idOrigem: 'aff_1',
        canonicoOver: {
          ehAfiliada: true,
          comprador: { nome: 'Recorrente', emails: ['recorrente@example.com'] },
        },
      });

      expect(await prisma.pessoa.count()).toBe(1);
      const tAff = await prisma.transacao.findFirst({ where: { idOrigem: 'aff_1' } });
      expect(tAff?.pessoaId).toBe(pessoa?.id);
      expect(tAff?.ofertaId).toBeNull();
      expect(tAff?.contratoId).toBeNull();
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — painel de transações', () => {
    beforeEach(async () => {
      await h.ingerirEProcessar({ idOrigem: 'pago_1' }); // PAGO
      await h.ingerirEProcessar({
        idOrigem: 'pend_1',
        canonicoOver: { statusOrigem: 'PENDENTE' },
      });
      await h.ingerirEProcessar({
        idOrigem: 'desc_1',
        canonicoOver: { statusOrigem: 'seila' }, // → DESCONHECIDO
      });
    });

    it('pagoDeFato=true → só PAGO', async () => {
      const r = await h.listar('pagoDeFato=true');
      expect(r.body.itens.map((i: { idOrigem: string }) => i.idOrigem)).toEqual(['pago_1']);
    });

    it('statusCanonico=PENDENTE → só a pendente', async () => {
      const r = await h.listar('statusCanonico=PENDENTE');
      expect(r.body.itens.map((i: { idOrigem: string }) => i.idOrigem)).toEqual(['pend_1']);
    });

    it('precisaRevisao=true → só a desconhecida', async () => {
      const r = await h.listar('precisaRevisao=true');
      expect(r.body.itens.map((i: { idOrigem: string }) => i.idOrigem)).toEqual(['desc_1']);
    });

    it('plataformaOrigem filtra; paginação com teto 100', async () => {
      const r = await h.listar('plataformaOrigem=GURU_PRD&tamanho=2&pagina=1');
      expect(r.body.total).toBe(3);
      expect(r.body.itens).toHaveLength(2);
      const bad = await h.listar('tamanho=500');
      expect(bad.status).toBe(400);
    });

    it('detalhe traz valores por moeda + pessoa resumida + eventoOrigemId; 404 se não existe', async () => {
      const lista = await h.listar('q=pago_1');
      const id = lista.body.itens[0].id;
      const det = await h.detalhe(id);
      expect(det.status).toBe(200);
      expect(det.body).toMatchObject({
        idOrigem: 'pago_1',
        valorBruto: { valorInt: expect.any(String), moeda: 'BRL' },
      });
      expect(det.body.pessoa).toMatchObject({ id: expect.any(String), nome: expect.any(String) });
      expect(det.body.eventoOrigemId).toEqual(expect.any(String));

      expect((await h.detalhe(randomUUID())).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------- US4

  describe('US4 — status bruto não catalogado → revisão', () => {
    it('statusOrigem "aprovado_x" → DESCONHECIDO + precisa_revisao; evento_origem = revisar', async () => {
      const { eventoId } = await h.ingerirEProcessar({
        canonicoOver: { statusOrigem: 'aprovado_x' },
      });
      const t = await prisma.transacao.findFirst();
      expect(t).toMatchObject({ statusCanonico: 'DESCONHECIDO', precisaRevisao: true });
      expect(t?.motivoRevisao).toContain('não catalogado');
      const ev = await prisma.eventoOrigem.findUnique({ where: { id: eventoId } });
      expect(ev?.status).toBe('revisar');
    });

    it('statusOrigem "PAGO" (canônico exato) → PAGO, sem revisão', async () => {
      await h.ingerirEProcessar({ canonicoOver: { statusOrigem: 'PAGO' } });
      const t = await prisma.transacao.findFirst();
      expect(t).toMatchObject({ statusCanonico: 'PAGO', precisaRevisao: false });
    });

    it('ocorridoEm lixo → ocorrido_em null + revisão, transação gravada', async () => {
      await h.ingerirEProcessar({ canonicoOver: { ocorridoEm: '32/13/2026' } });
      const t = await prisma.transacao.findFirst();
      expect(t?.ocorridoEm).toBeNull();
      expect(t?.precisaRevisao).toBe(true);
      expect(t?.motivoRevisao).toContain('data não parseável');
    });
  });

  // ------------------------------------------------------ idempotência

  describe('idempotência / concorrência', () => {
    it('reprocessar não duplica transação nem pessoa; campos_alterados vazio', async () => {
      const { eventoId } = await h.ingerirEProcessar({ idOrigem: 'idem_1' });
      const rep = await h.reprocessar(eventoId, true);
      expect(rep.status).toBe(200);
      await h.processar();

      expect(await prisma.transacao.count({ where: { idOrigem: 'idem_1' } })).toBe(1);
      expect(await prisma.pessoa.count()).toBe(1);
      const ev = await h.eventoDetalhe(eventoId);
      const upsert = ev.body.etapas.find(
        (e: { etapa: string }) => e.etapa === 'UPSERT_TRANSACAO',
      );
      expect(upsert.resultado).toMatchObject({ foi_criada: false, campos_alterados: [] });
    });

    it('2 passadas concorrentes sobre o mesmo evento → 1 transação', async () => {
      const idOrigem = 'conc_1';
      const body = {
        plataformaOrigem: 'GURU_PRD',
        tipoOrigem: 'guru.webhook',
        idOrigem,
        payloadBruto: { id: idOrigem },
        eventoCanonico: montarCanonico({ idOrigem }),
      };
      await http().post('/ingestao/eventos').set(authHeader()).send(body);
      await Promise.all([h.processar(), h.processar()]);
      expect(await prisma.transacao.count({ where: { idOrigem } })).toBe(1);
    });
  });

  // ------------------------------------------------------------- guard

  describe('guard + catálogo RBAC', () => {
    it('sem token → 401', async () => {
      await http().get('/financeiro/transacoes').expect(401);
      await http().get(`/financeiro/transacoes/${randomUUID()}`).expect(401);
    });

    it('autenticado sem transacao:ver → 403', async () => {
      const { token } = await h.sujeitoCom([]);
      const r = await http()
        .get('/financeiro/transacoes')
        .set({ Authorization: `Bearer ${token}` });
      expect(r.status).toBe(403);
    });

    it('sujeito com transacao:ver → 200', async () => {
      const { token } = await h.sujeitoCom(['transacao:ver']);
      const r = await http()
        .get('/financeiro/transacoes')
        .set({ Authorization: `Bearer ${token}` });
      expect(r.status).toBe(200);
    });

    it('GET /admin/rbac/permissoes inclui transacao:ver; efetivas da credencial de serviço também', async () => {
      const cat = await http().get('/admin/rbac/permissoes').set(authHeader());
      const ids = cat.body.recursos.flatMap((g: { permissoes: { id: string }[] }) =>
        g.permissoes.map((p) => p.id),
      );
      expect(ids).toContain('transacao:ver');
      const ef = await http().get('/auth/permissoes-efetivas').set(authHeader());
      expect(ef.body.permissoes).toContain('transacao:ver');
    });
  });

  // --------------------------------------------------------- fronteira

  it('fronteira: `src/financeiro` não importa `ingestao`/`clientes`; `src/ingestao` não importa `financeiro`', () => {
    const grep = (alvo: string, proibido: string) => {
      try {
        return execFileSync(
          'grep',
          ['-rEl', `from ['"].*/${proibido}/`, `src/${alvo}`],
          { cwd: process.cwd(), encoding: 'utf8' },
        ).trim();
      } catch {
        return ''; // grep sai 1 quando não acha nada
      }
    };
    expect(grep('financeiro', 'ingestao')).toBe('');
    expect(grep('financeiro', 'clientes')).toBe('');
    expect(grep('ingestao', 'financeiro')).toBe('');
  });
});
