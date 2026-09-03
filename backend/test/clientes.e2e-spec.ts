import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PERFIL_ADMIN_ID } from '../src/auth/auth.constants';
import { ResolverOuCriarService } from '../src/clientes/application/resolver-ou-criar.service';
import { authHeader } from './support/auth';
import {
  clientesHelpers,
  CPF_VALIDO_1,
  CPF_VALIDO_2,
  CPF_VALIDO_3,
} from './support/clientes';

/**
 * spec 005 — pessoa e conta (e2e, Postgres real). CRUD manual, engine
 * `resolverOuCriar`, merge/desfazer reversível em qualquer ordem, `conta`, guard.
 */
describe('clientes — pessoa e conta (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let resolver: ResolverOuCriarService;
  let h: ReturnType<typeof clientesHelpers>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    resolver = moduleRef.get(ResolverOuCriarService);
    h = clientesHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.clientesAudit.deleteMany({});
    await prisma.notaReconciliacao.deleteMany({});
    await prisma.mergePessoa.deleteMany({});
    await prisma.mergeConta.deleteMany({});
    await prisma.pessoaOrigemRef.deleteMany({});
    await prisma.pessoaEmail.deleteMany({});
    await prisma.pessoaTelefone.deleteMany({});
    await prisma.pessoaDocumento.deleteMany({});
    await prisma.pessoaEndereco.deleteMany({});
    await prisma.pessoa.updateMany({ data: { mergedPara: null, contaId: null } });
    await prisma.pessoa.deleteMany({});
    await prisma.conta.updateMany({ data: { mergedPara: null } });
    await prisma.conta.deleteMany({});
    await prisma.rbacAudit.deleteMany({});
    await prisma.usuarioPerfil.deleteMany({});
    await prisma.usuario.deleteMany({});
    await prisma.perfilPermissao.deleteMany({
      where: { perfilId: { not: PERFIL_ADMIN_ID } },
    });
    await prisma.perfil.deleteMany({ where: { deSistema: false } });
  });

  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader();

  // ------------------------------------------------------------- CRUD pessoa
  describe('CRUD manual de pessoa (US3)', () => {
    it('1 — POST só com nome + CPF → 201; CPF vira documento; 1 audit "criado"', async () => {
      const res = await http()
        .post('/pessoas')
        .set(ADMIN)
        .send({ nome: 'Maria', documentos: [CPF_VALIDO_1] });
      expect(res.status).toBe(201);
      expect(res.body.documentos).toEqual([
        { tipo: 'CPF', valor: CPF_VALIDO_1, curado: true },
      ]);
      const audits = await prisma.clientesAudit.findMany({
        where: { entidadeId: res.body.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].campo).toBe('criado');
      expect(audits[0].autor).toBeTruthy();
    });

    it('2 — POST com CPF de DV inválido → 400, nada persiste', async () => {
      const res = await http()
        .post('/pessoas')
        .set(ADMIN)
        .send({ nome: 'X', documentos: ['111.111.111-11'] });
      expect(res.status).toBe(400);
      expect(await prisma.pessoa.count()).toBe(0);
    });

    it('3 — POST com e-mail já de outra pessoa → 409 {pessoaId}, sem fusão', async () => {
      const p1 = await h.criarPessoa({ nome: 'A', emails: ['dup@x.com'] });
      const res = await http()
        .post('/pessoas')
        .set(ADMIN)
        .send({ nome: 'B', emails: ['DUP@x.com'] });
      expect(res.status).toBe(409);
      expect(res.body.pessoaId).toBe(p1);
      expect(await prisma.pessoa.count()).toBe(1);
    });

    it('4 — PATCH define novo emailPrimario → rebaixa antigo, marca curado, 1 audit', async () => {
      const id = await h.criarPessoa({ nome: 'C', emails: ['primeiro@x.com'] });
      await prisma.clientesAudit.deleteMany({ where: { entidadeId: id } });
      const res = await http()
        .patch(`/pessoas/${id}`)
        .set(ADMIN)
        .send({ adicionarEmails: ['segundo@x.com'], emailPrimario: 'segundo@x.com' });
      expect(res.status).toBe(200);
      const primario = res.body.emails.find((e: { primario: boolean }) => e.primario);
      expect(primario.valor).toBe('segundo@x.com');
      expect(primario.curado).toBe(true);
      const antigo = res.body.emails.find(
        (e: { valor: string }) => e.valor === 'primeiro@x.com',
      );
      expect(antigo.primario).toBe(false);
      expect(antigo.rebaixadoEm).toBeTruthy();
      const audits = await prisma.clientesAudit.findMany({ where: { entidadeId: id } });
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    it('5 — PATCH salvando o mesmo nome → 200, 0 audit (no-op)', async () => {
      const id = await h.criarPessoa({ nome: 'Igual', emails: ['a@x.com'] });
      await prisma.clientesAudit.deleteMany({ where: { entidadeId: id } });
      const res = await http().patch(`/pessoas/${id}`).set(ADMIN).send({ nome: 'Igual' });
      expect(res.status).toBe(200);
      expect(await prisma.clientesAudit.count({ where: { entidadeId: id } })).toBe(0);
    });

    it('6 — PATCH removendo a última âncora → 400', async () => {
      const id = await h.criarPessoa({ nome: 'Solo', emails: ['solo@x.com'] });
      const res = await http()
        .patch(`/pessoas/${id}`)
        .set(ADMIN)
        .send({ removerEmails: ['solo@x.com'] });
      expect(res.status).toBe(400);
    });

    it('7 — DELETE /pessoas/:id não existe (404/405)', async () => {
      const id = await h.criarPessoa({ nome: 'Z', emails: ['z@x.com'] });
      const res = await http().delete(`/pessoas/${id}`).set(ADMIN);
      expect([404, 405]).toContain(res.status);
    });

    it('busca casa e-mail secundário', async () => {
      const id = await h.criarPessoa({ nome: 'Busca', emails: ['principal@x.com'] });
      await http()
        .patch(`/pessoas/${id}`)
        .set(ADMIN)
        .send({ adicionarEmails: ['segredo@x.com'] });
      const res = await http().get('/pessoas?q=segredo').set(ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.itens.map((i: { id: string }) => i.id)).toContain(id);
    });
  });

  // ------------------------------------------------------------- resolverOuCriar
  describe('resolverOuCriar (US2)', () => {
    const origem = (valorRef: string) => ({
      plataformaOrigem: 'GURU_PRD',
      refs: [{ tipoRef: 'guru_customer_id', valorRef }],
    });

    it('9 — sem match, criar:true → cria pessoa + pessoa_origem_ref', async () => {
      const r = await resolver.resolverOuCriar(
        { nome: 'Nova', documento: CPF_VALIDO_2, email: 'nova@x.com' },
        { criar: true, origem: origem('cus_1') },
      );
      expect(r.criada).toBe(true);
      expect(r.pessoaId).toBeTruthy();
      const refs = await prisma.pessoaOrigemRef.findMany({
        where: { pessoaId: r.pessoaId! },
      });
      expect(refs).toHaveLength(1);
      expect(refs[0].plataformaOrigem).toBe('GURU_PRD');
    });

    it('10 — mesmo documento, e-mail novo, primário não curado → rotaciona', async () => {
      const a = await resolver.resolverOuCriar(
        { nome: 'Rot', documento: CPF_VALIDO_2, email: 'velho@x.com' },
        { criar: true, origem: origem('cus_2') },
      );
      const b = await resolver.resolverOuCriar(
        { documento: CPF_VALIDO_2, email: 'novo@x.com' },
        { criar: true, origem: origem('cus_2b') },
      );
      expect(b.pessoaId).toBe(a.pessoaId);
      const emails = await prisma.pessoaEmail.findMany({
        where: { pessoaId: a.pessoaId! },
        orderBy: { primario: 'desc' },
      });
      expect(emails.find((e) => e.primario)?.valor).toBe('novo@x.com');
      expect(emails.find((e) => !e.primario)?.valor).toBe('velho@x.com');
      expect(emails.find((e) => !e.primario)?.rebaixadoEm).toBeTruthy();
    });

    it('11 — primário curado → e-mail novo entra secundário + 1 nota_reconciliacao', async () => {
      const id = await h.criarPessoa({
        nome: 'Cur',
        documentos: [CPF_VALIDO_3],
        emails: ['curado@x.com'],
      });
      const r = await resolver.resolverOuCriar(
        { documento: CPF_VALIDO_3, email: 'derivado@x.com' },
        { criar: false, origem: origem('cus_cur') },
      );
      expect(r.pessoaId).toBe(id);
      expect(r.notas).toBe(1);
      const primario = await prisma.pessoaEmail.findFirst({
        where: { pessoaId: id, primario: true },
      });
      expect(primario?.valor).toBe('curado@x.com');
      const nota = await prisma.notaReconciliacao.findMany({ where: { entidadeId: id } });
      expect(nota).toHaveLength(1);
      expect(nota[0].motivo).toBe('primario_curado');
    });

    it('12 — repetir a mesma chamada é no-op (idempotente)', async () => {
      const dados = { nome: 'Idem', documento: CPF_VALIDO_2, email: 'idem@x.com' };
      const o = { criar: true as const, origem: origem('cus_idem') };
      await resolver.resolverOuCriar(dados, o);
      await resolver.resolverOuCriar(dados, o);
      const r3 = await resolver.resolverOuCriar(dados, o);
      expect(await prisma.pessoa.count()).toBe(1);
      expect(
        await prisma.pessoaOrigemRef.count({ where: { pessoaId: r3.pessoaId! } }),
      ).toBe(1);
      const emails = await prisma.pessoaEmail.findMany({
        where: { pessoaId: r3.pessoaId! },
      });
      expect(emails).toHaveLength(1);
      expect(emails[0].primario).toBe(true);
    });

    it('13 — sem match, criar:false (afiliada) → pessoaId null, 0 escrita', async () => {
      const r = await resolver.resolverOuCriar(
        { nome: 'Afiliada', documento: CPF_VALIDO_1 },
        { criar: false, origem: origem('cus_af') },
      );
      expect(r.pessoaId).toBeNull();
      expect(r.criada).toBe(false);
      expect(await prisma.pessoa.count()).toBe(0);
    });

    it('14 — e-mail ambíguo, criar:true → cria pessoa nova + 2 candidatos', async () => {
      // ambiguidade não acontece pela API manual (unicidade) — semeia direto
      for (const n of ['Dup1', 'Dup2']) {
        await prisma.pessoa.create({
          data: {
            id: randomUUID(),
            nome: n,
            emails: { create: { id: randomUUID(), valor: 'amb@x.com', primario: true } },
          },
        });
      }
      const r = await resolver.resolverOuCriar(
        { nome: 'Terceiro', email: 'amb@x.com' },
        { criar: true, origem: origem('cus_amb') },
      );
      expect(r.criada).toBe(true);
      expect(r.candidatos).toHaveLength(2);
      expect(await prisma.pessoa.count()).toBe(3);
    });
  });

  // ------------------------------------------------------------- merge pessoa
  describe('merge / desfazer de pessoa (US4)', () => {
    it('8 — merge move contatos como secundários; GET da absorvida resolve para a sobrevivente', async () => {
      const a = await h.criarPessoa({ nome: 'A', emails: ['a@x.com'] });
      const b = await h.criarPessoa({ nome: 'B', emails: ['b@x.com'] });
      const res = await http()
        .post(`/pessoas/${a}/merge`)
        .set(ADMIN)
        .send({ absorvidaId: b });
      expect(res.status).toBe(200);
      const emailB = res.body.emails.find((e: { valor: string }) => e.valor === 'b@x.com');
      expect(emailB.primario).toBe(false);
      const getB = await http().get(`/pessoas/${b}`).set(ADMIN);
      expect(getB.status).toBe(200);
      expect(getB.body.id).toBe(a);
      expect(getB.body.unificacao.deId).toBe(b);
      const merge = await prisma.mergePessoa.findFirst({ where: { sobreviventeId: a } });
      expect(merge?.snapshot).toBeTruthy();
      const audit = await prisma.clientesAudit.findMany({
        where: { entidadeId: a, campo: 'merge' },
      });
      expect(audit).toHaveLength(1);
    });

    it('9 — merge encadeado, desfazer o PRIMEIRO (fora de ordem) → B recriada, merge de C intacto', async () => {
      const a = await h.criarPessoa({ nome: 'A', emails: ['a@x.com'] });
      const b = await h.criarPessoa({ nome: 'B', emails: ['b@x.com'] });
      const c = await h.criarPessoa({ nome: 'C', emails: ['c@x.com'] });
      const m1 = await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: b });
      const mergeDoB = (await prisma.mergePessoa.findFirst({ where: { absorvidaId: b } }))!.id;
      await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: c });
      expect(m1.status).toBe(200);

      const undo = await http()
        .post(`/pessoas/${a}/merge/${mergeDoB}/desfazer`)
        .set(ADMIN);
      expect(undo.status).toBe(200);

      const getB = await http().get(`/pessoas/${b}`).set(ADMIN);
      expect(getB.body.id).toBe(b);
      expect(getB.body.emails.map((e: { valor: string }) => e.valor)).toContain('b@x.com');

      const mergeC = await prisma.mergePessoa.findFirst({ where: { absorvidaId: c } });
      expect(mergeC?.estado).toBe('ATIVO');
      const emailC = await prisma.pessoaEmail.findFirst({ where: { valor: 'c@x.com' } });
      expect(emailC?.pessoaId).toBe(a);
    });

    it('10 — desfazer 2× o mesmo merge → 1º 200, 2º 409', async () => {
      const a = await h.criarPessoa({ nome: 'A', emails: ['a@x.com'] });
      const b = await h.criarPessoa({ nome: 'B', emails: ['b@x.com'] });
      await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: b });
      const m = (await prisma.mergePessoa.findFirst({ where: { absorvidaId: b } }))!.id;
      expect((await http().post(`/pessoas/${a}/merge/${m}/desfazer`).set(ADMIN)).status).toBe(200);
      expect((await http().post(`/pessoas/${a}/merge/${m}/desfazer`).set(ADMIN)).status).toBe(409);
    });

    it('11 — curar um contato movido DEPOIS do merge, depois desfazer → contato fica + nota divergiu_pos_merge', async () => {
      const a = await h.criarPessoa({ nome: 'A', emails: ['a@x.com'] });
      // B com um e-mail secundário NÃO curado (curadoria só vale se veio depois do merge)
      const b = await h.criarPessoa({ nome: 'B', emails: ['b@x.com'] });
      await prisma.pessoaEmail.create({
        data: { id: randomUUID(), pessoaId: b, valor: 'b2@x.com', primario: false, curado: false },
      });
      await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: b });
      const m = (await prisma.mergePessoa.findFirst({ where: { absorvidaId: b } }))!.id;
      // cura o contato movido DEPOIS do merge (b2@x.com agora está em A)
      await prisma.pessoaEmail.updateMany({
        where: { valor: 'b2@x.com' },
        data: { curado: true },
      });
      const undo = await http().post(`/pessoas/${a}/merge/${m}/desfazer`).set(ADMIN);
      expect(undo.status).toBe(200);
      const emailB2 = await prisma.pessoaEmail.findFirst({ where: { valor: 'b2@x.com' } });
      expect(emailB2?.pessoaId).toBe(a); // ficou na sobrevivente (curado pós-merge prevalece)
      const notas = await prisma.notaReconciliacao.findMany({
        where: { motivo: 'divergiu_pos_merge' },
      });
      expect(notas.length).toBeGreaterThanOrEqual(1);
    });

    it('merge inválido → 400 / 404 / 409', async () => {
      const a = await h.criarPessoa({ nome: 'A', emails: ['a@x.com'] });
      expect(
        (await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: a })).status,
      ).toBe(400);
      const idInexistente = '00000000-0000-7000-8000-000000000000';
      expect(
        (await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: idInexistente })).status,
      ).toBe(404);
      const b = await h.criarPessoa({ nome: 'B', emails: ['b@x.com'] });
      await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: b });
      expect(
        (await http().post(`/pessoas/${a}/merge`).set(ADMIN).send({ absorvidaId: b })).status,
      ).toBe(409);
    });
  });

  // ------------------------------------------------------------- conta
  describe('conta (US5)', () => {
    it('1 — POST conta + associar 3 pessoas → GET mostra 3 membros', async () => {
      const c = await h.criarConta('HOUSEHOLD', 'Família Souza');
      const ids: string[] = [];
      for (const n of ['P1', 'P2', 'P3']) {
        ids.push(await h.criarPessoa({ nome: n, emails: [`${n}@x.com`] }));
      }
      for (const id of ids) {
        const r = await http().post(`/contas/${c}/pessoas`).set(ADMIN).send({ pessoaId: id });
        expect(r.status).toBe(200);
      }
      const get = await http().get(`/contas/${c}`).set(ADMIN);
      expect(get.body.pessoas).toHaveLength(3);
    });

    it('2 — associar pessoa que já está em outra conta → 409 {contaId}', async () => {
      const c1 = await h.criarConta('HOUSEHOLD', 'C1');
      const c2 = await h.criarConta('HOUSEHOLD', 'C2');
      const p = await h.criarPessoa({ nome: 'P', emails: ['p@x.com'] });
      await http().post(`/contas/${c1}/pessoas`).set(ADMIN).send({ pessoaId: p });
      const r = await http().post(`/contas/${c2}/pessoas`).set(ADMIN).send({ pessoaId: p });
      expect(r.status).toBe(409);
      expect(r.body.contaId).toBe(c1);
    });

    it('4/5 — merge_conta + adicionar pessoa depois + desfazer', async () => {
      const c1 = await h.criarConta('HOUSEHOLD', 'C1');
      const c2 = await h.criarConta('HOUSEHOLD', 'C2');
      const p1 = await h.criarPessoa({ nome: 'P1', emails: ['p1@x.com'] });
      const p2 = await h.criarPessoa({ nome: 'P2', emails: ['p2@x.com'] });
      const p3 = await h.criarPessoa({ nome: 'P3', emails: ['p3@x.com'] });
      await http().post(`/contas/${c2}/pessoas`).set(ADMIN).send({ pessoaId: p1 });
      await http().post(`/contas/${c2}/pessoas`).set(ADMIN).send({ pessoaId: p2 });
      await http().post(`/contas/${c1}/merge`).set(ADMIN).send({ absorvidaId: c2 });
      // p3 entra em C1 DEPOIS do merge
      await http().post(`/contas/${c1}/pessoas`).set(ADMIN).send({ pessoaId: p3 });

      const merge = (await prisma.mergeConta.findFirst({ where: { absorvidaId: c2 } }))!.id;
      const undo = await http().post(`/contas/${c1}/merge/${merge}/desfazer`).set(ADMIN);
      expect(undo.status).toBe(200);

      const getC2 = await http().get(`/contas/${c2}`).set(ADMIN);
      expect(getC2.body.pessoas.map((x: { id: string }) => x.id).sort()).toEqual([p1, p2].sort());
      const getC1 = await http().get(`/contas/${c1}`).set(ADMIN);
      expect(getC1.body.pessoas.map((x: { id: string }) => x.id)).toContain(p3);
    });

    it('6 — módulo clientes não referencia contrato (SC-012)', () => {
      const out = execSync('grep -rn "contrato" src/clientes || true', {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      const linhasEfetivas = out
        .split('\n')
        .filter((l) => l.trim() && !/\/\/|\*|#|regra/i.test(l));
      expect(linhasEfetivas).toEqual([]);
    });
  });

  // ------------------------------------------------------------- guard
  describe('guard (US3/US6)', () => {
    it('GET /pessoas sem token → 401', async () => {
      expect((await http().get('/pessoas')).status).toBe(401);
    });

    it('Usuario sem permissão → 403; com pessoa:ver → 200; POST exige pessoa:editar', async () => {
      const semPerm = await h.tokenComPermissoes([]);
      expect(
        (await http().get('/pessoas').set({ Authorization: `Bearer ${semPerm}` })).status,
      ).toBe(403);

      const soVer = await h.tokenComPermissoes(['pessoa:ver']);
      expect(
        (await http().get('/pessoas').set({ Authorization: `Bearer ${soVer}` })).status,
      ).toBe(200);
      expect(
        (
          await http()
            .post('/pessoas')
            .set({ Authorization: `Bearer ${soVer}` })
            .send({ nome: 'X', emails: ['x@x.com'] })
        ).status,
      ).toBe(403);

      const editar = await h.tokenComPermissoes(['pessoa:ver', 'pessoa:editar']);
      expect(
        (
          await http()
            .post('/pessoas')
            .set({ Authorization: `Bearer ${editar}` })
            .send({ nome: 'X', emails: ['x@x.com'] })
        ).status,
      ).toBe(201);
    });

    it('credencial de serviço → 200 (concede tudo)', async () => {
      expect((await http().get('/pessoas').set(ADMIN)).status).toBe(200);
    });
  });

  // ------------------------------------------------------------- regressão
  describe('regressão', () => {
    it('/health continua com 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.status).toBe(200);
      expect(res.body.contexts).toHaveLength(11);
    });
  });
});
