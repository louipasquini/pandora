import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader } from './support/auth';
import { crmInteracaoHelpers } from './support/crm-interacao';

/**
 * spec 009 — Timeline de interação, tag e segmento (e2e, Postgres real).
 * Timeline unida por âncora (pessoa ∪ leads convertidos), mutabilidade só em
 * `NOTA` (CL-05), escopo de leitura por âncora (sem permissão nova), tag
 * compartilhada lead|pessoa|interacao (regressão do contrato REST da 008),
 * segmento sempre derivado na leitura, guard 401/403/2xx, catálogo +5,
 * `CONTEXT_MODULES` = 11.
 */
describe('crm — Interação/Tag/Segmento (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmInteracaoHelpers>;
  const ADMIN = authHeader();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmInteracaoHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.crmInteracaoAudit.deleteMany({});
    await prisma.tagAssociacao.deleteMany({});
    await prisma.interacao.deleteMany({});
    await prisma.segmento.deleteMany({});
    await prisma.tag.deleteMany({});
  });

  const http = () => request(app.getHttpServer());

  // ------------------------------------------------------------ US1/US3: timeline

  describe('US1/US3 — timeline unificada e escopo por âncora', () => {
    it('cria interação em pessoa e em lead; GET da pessoa não traz a do lead ainda não convertido', async () => {
      const pessoaId = await h.criarPessoa();
      const leadId = await h.criarLead();

      const cp = await h.criarInteracao({ pessoaId }, { tipo: 'LIGACAO', direcao: 'SAIDA' });
      expect(cp.status).toBe(201);
      const cl = await h.criarInteracao({ leadId }, { tipo: 'NOTA' });
      expect(cl.status).toBe(201);

      const timeline = await http()
        .get(`/crm/pessoas/${pessoaId}/interacoes`)
        .set(ADMIN);
      expect(timeline.status).toBe(200);
      const ids = (timeline.body.itens as { id: string }[]).map((i) => i.id);
      expect(ids).toContain(cp.body.id);
      expect(ids).not.toContain(cl.body.id);
    });

    it('CL-01: após converter o lead, a timeline da pessoa inclui a interação do lead — sem duplicar', async () => {
      const email = `conv+${Date.now()}@x.com`;
      const leadId = await h.criarLead({ email });
      const interLead = await h.criarInteracao({ leadId }, { tipo: 'NOTA', conteudo: 'nota do lead' });
      expect(interLead.status).toBe(201);

      const conv = await http().post(`/crm/leads/${leadId}/converter`).set(ADMIN);
      expect(conv.status).toBe(200);
      const pessoaId = conv.body.pessoaId as string;

      const interPessoa = await h.criarInteracao({ pessoaId }, { tipo: 'NOTA', conteudo: 'nota da pessoa' });

      const timeline = await http().get(`/crm/pessoas/${pessoaId}/interacoes`).set(ADMIN);
      const ids = (timeline.body.itens as { id: string }[]).map((i) => i.id);
      expect(ids).toEqual(
        expect.arrayContaining([interLead.body.id, interPessoa.body.id]),
      );
      expect(new Set(ids).size).toBe(ids.length); // sem duplicata

      // a linha de interação do lead não foi re-apontada (segue lead_id, não pessoa_id)
      const bruta = await prisma.interacao.findUnique({ where: { id: interLead.body.id as string } });
      expect(bruta?.leadId).toBe(leadId);
      expect(bruta?.pessoaId).toBeNull();
    });

    it('POST com pessoaId e leadId juntos, ou nenhum, → 422', async () => {
      const pessoaId = await h.criarPessoa();
      const leadId = await h.criarLead();
      const ambos = await h.criarInteracao({ pessoaId, leadId });
      expect(ambos.status).toBe(422);
      const nenhum = await h.criarInteracao({});
      expect(nenhum.status).toBe(422);
    });

    it('âncora inexistente → 404', async () => {
      const r = await h.criarInteracao({ pessoaId: '00000000-0000-0000-0000-000000000000' });
      expect(r.status).toBe(404);
    });

    it('NPS sem notaNps → 422; notaNps fora de 0-10 → 422; NOTA com direcao → 422', async () => {
      const pessoaId = await h.criarPessoa();
      const semNota = await h.criarInteracao({ pessoaId }, { tipo: 'NPS' });
      expect(semNota.status).toBe(422);
      const foraDeFaixa = await h.criarInteracao({ pessoaId }, { tipo: 'NPS', notaNps: 11 });
      expect(foraDeFaixa.status).toBe(422);
      const notaComDirecao = await h.criarInteracao({ pessoaId }, { tipo: 'NOTA', direcao: 'SAIDA' });
      expect(notaComDirecao.status).toBe(422);
    });

    it('escopo: lead fora do ver_proprios → 404; pessoa sem pessoa:ver → 403', async () => {
      const leadId = await h.criarLead();
      const outro = await h.sujeitoCom(['lead:ver_proprios', 'interacao:registrar']);
      const r1 = await http().get(`/crm/leads/${leadId}/interacoes`).set(bearer(outro.token));
      expect(r1.status).toBe(404);

      const pessoaId = await h.criarPessoa();
      const semPessoaVer = await h.sujeitoCom(['interacao:registrar']);
      const r2 = await http().get(`/crm/pessoas/${pessoaId}/interacoes`).set(bearer(semPessoaVer.token));
      expect(r2.status).toBe(403);
    });
  });

  // ------------------------------------------------------------ US2: mutabilidade

  describe('US2 — mutabilidade só em NOTA (CL-05)', () => {
    it('NOTA própria: PATCH edita + audita; DELETE remove (soft) + audita', async () => {
      const pessoaId = await h.criarPessoa();
      const sujeito = await h.sujeitoCom(['interacao:registrar', 'pessoa:ver']);
      const c = await h.criarInteracao({ pessoaId }, { tipo: 'NOTA' }, sujeito.token);
      expect(c.status).toBe(201);

      const patch = await http()
        .patch(`/crm/interacoes/${c.body.id}`)
        .set(bearer(sujeito.token))
        .send({ conteudo: 'novo conteúdo' });
      expect(patch.status).toBe(200);
      expect(patch.body.conteudo).toBe('novo conteúdo');
      expect(patch.body.editadoEm).toBeTruthy();

      const del = await http()
        .delete(`/crm/interacoes/${c.body.id}`)
        .set(bearer(sujeito.token));
      expect(del.status).toBe(200);
      expect(del.body.removidoEm).toBeTruthy();

      const aud = await prisma.crmInteracaoAudit.findMany({ where: { entidadeId: c.body.id as string } });
      expect(aud.filter((a) => a.motivo === 'editar_nota')).toHaveLength(1);
      expect(aud.filter((a) => a.motivo === 'remover_nota')).toHaveLength(1);
    });

    it('NOTA já removida → 409 em novo PATCH/DELETE', async () => {
      const pessoaId = await h.criarPessoa();
      const c = await h.criarInteracao({ pessoaId }, { tipo: 'NOTA' });
      await http().delete(`/crm/interacoes/${c.body.id}`).set(ADMIN);
      const patch = await http()
        .patch(`/crm/interacoes/${c.body.id}`)
        .set(ADMIN)
        .send({ conteudo: 'x' });
      expect(patch.status).toBe(409);
    });

    it('NOTA de outro autor sem interacao:gerir → 403; com interacao:gerir → sucede', async () => {
      const pessoaId = await h.criarPessoa();
      const autor = await h.sujeitoCom(['interacao:registrar', 'pessoa:ver']);
      const c = await h.criarInteracao({ pessoaId }, { tipo: 'NOTA' }, autor.token);

      const semGerir = await h.sujeitoCom(['interacao:registrar', 'pessoa:ver']);
      const r1 = await http()
        .patch(`/crm/interacoes/${c.body.id}`)
        .set(bearer(semGerir.token))
        .send({ conteudo: 'y' });
      expect(r1.status).toBe(403);

      const comGerir = await h.sujeitoCom(['interacao:registrar', 'interacao:gerir', 'pessoa:ver']);
      const r2 = await http()
        .patch(`/crm/interacoes/${c.body.id}`)
        .set(bearer(comGerir.token))
        .send({ conteudo: 'z' });
      expect(r2.status).toBe(200);
    });

    it.each(['WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET', 'NPS'] as const)(
      '%s nunca é editável/removível, mesmo com interacao:gerir',
      async (tipo) => {
        const pessoaId = await h.criarPessoa();
        const corpo =
          tipo === 'NPS' ? { tipo, notaNps: 8 } : { tipo, direcao: 'SAIDA' as const };
        const c = await h.criarInteracao({ pessoaId }, corpo);
        expect(c.status).toBe(201);

        const patch = await http()
          .patch(`/crm/interacoes/${c.body.id}`)
          .set(ADMIN)
          .send({ conteudo: 'tentativa' });
        expect([405, 409]).toContain(patch.status);

        const del = await http().delete(`/crm/interacoes/${c.body.id}`).set(ADMIN);
        expect([405, 409]).toContain(del.status);
      },
    );
  });

  // ------------------------------------------------------------ US4: tags

  describe('US4 — tag compartilhada entre lead, pessoa e interação', () => {
    it('reaproveita a mesma tag entre lead e pessoa (variação de caixa/espaço)', async () => {
      const leadId = await h.criarLead();
      const t1 = await http().post(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: 'Cliente VIP' });
      expect(t1.status).toBe(201);
      expect(t1.body.tags).toContain('cliente-vip');

      const pessoaId = await h.criarPessoa();
      const t2 = await http()
        .post(`/crm/pessoas/${pessoaId}/tags`)
        .set(ADMIN)
        .send({ tag: 'cliente   vip' });
      expect(t2.status).toBe(201);
      expect(t2.body.tags).toContain('cliente-vip');

      const catalogo = await http().get('/crm/tags').set(ADMIN);
      const linha = (catalogo.body as { slug: string; usos: Record<string, number> }[]).find(
        (x) => x.slug === 'cliente-vip',
      );
      expect(linha).toBeTruthy();
      expect(linha!.usos.lead).toBe(1);
      expect(linha!.usos.pessoa).toBe(1);
    });

    it('associar 2x é idempotente; remover não afeta a outra âncora', async () => {
      const leadId = await h.criarLead();
      const pessoaId = await h.criarPessoa();
      await http().post(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: 'dupla' });
      const dup = await http().post(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: 'dupla' });
      expect(dup.body.tags.filter((t: string) => t === 'dupla')).toHaveLength(1);

      await http().post(`/crm/pessoas/${pessoaId}/tags`).set(ADMIN).send({ tag: 'dupla' });
      await http().delete(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: 'dupla' });

      const pessoaTags = await http().get(`/pessoas/${pessoaId}`).set(ADMIN);
      // a tag da pessoa não é afetada pela remoção no lead — verificado via catálogo
      const catalogo = await http().get('/crm/tags').set(ADMIN);
      const linha = (catalogo.body as { slug: string; usos: Record<string, number> }[]).find(
        (x) => x.slug === 'dupla',
      );
      expect(linha!.usos.lead).toBe(0);
      expect(linha!.usos.pessoa).toBe(1);
      void pessoaTags;
    });

    it('regressão do contrato REST da 008: POST/DELETE /crm/leads/:id/tags mantém a forma', async () => {
      const leadId = await h.criarLead();
      const t1 = await http().post(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: '  Webinar Out ' });
      expect(t1.status).toBe(201);
      expect(t1.body.tags).toContain('webinar-out');
      const t2 = await http().post(`/crm/leads/${leadId}/tags`).set(ADMIN).send({ tag: 'webinar out' });
      expect(t2.body.tags.filter((x: string) => x === 'webinar-out')).toHaveLength(1);
      const del = await http()
        .delete(`/crm/leads/${leadId}/tags`)
        .set(ADMIN)
        .send({ tag: 'webinar-out' });
      expect(del.status).toBe(200);
      expect(del.body.tags).not.toContain('webinar-out');
    });

    it('sem pessoa:editar → 403 ao tentar tag em pessoa', async () => {
      const pessoaId = await h.criarPessoa();
      const sujeito = await h.sujeitoCom(['pessoa:ver']);
      const r = await http()
        .post(`/crm/pessoas/${pessoaId}/tags`)
        .set(bearer(sujeito.token))
        .send({ tag: 'x' });
      expect(r.status).toBe(403);
    });
  });

  // ------------------------------------------------------------ US5: segmento

  describe('US5 — segmento dinâmico por query salva', () => {
    it('filtro fora do esquema fechado → 422; alvo PESSOA com campo de LEAD → 422', async () => {
      const r1 = await http()
        .post('/crm/segmentos')
        .set(ADMIN)
        .send({ nome: 'seg', alvo: 'LEAD', filtro: { valorEstimado: 100 } });
      expect(r1.status).toBe(422);
      const r2 = await http()
        .post('/crm/segmentos')
        .set(ADMIN)
        .send({ nome: 'seg2', alvo: 'PESSOA', filtro: { estagio: ['QUALIFICADO'] } });
      expect(r2.status).toBe(422);
    });

    it('membros respeitam o filtro e refletem mudança sem ação manual', async () => {
      const leadId = await h.criarLead({ estagio: 'QUALIFICADO' });
      const outroLeadId = await h.criarLead({ estagio: 'NOVO' });

      const seg = await http()
        .post('/crm/segmentos')
        .set(ADMIN)
        .send({ nome: 'quentes', alvo: 'LEAD', filtro: { estagio: ['QUALIFICADO'] } });
      expect(seg.status).toBe(201);

      const membros1 = await http().get(`/crm/segmentos/${seg.body.id}/membros`).set(ADMIN);
      const ids1 = (membros1.body.itens as { id: string }[]).map((i) => i.id);
      expect(ids1).toContain(leadId);
      expect(ids1).not.toContain(outroLeadId);

      await http().patch(`/crm/leads/${leadId}`).set(ADMIN).send({ estagio: 'NUTRICAO' });
      const membros2 = await http().get(`/crm/segmentos/${seg.body.id}/membros`).set(ADMIN);
      const ids2 = (membros2.body.itens as { id: string }[]).map((i) => i.id);
      expect(ids2).not.toContain(leadId);
    });

    it('membros de segmento LEAD respeitam o escopo lead:ver_proprios do sujeito', async () => {
      await h.criarLead({ estagio: 'QUALIFICADO' }); // responsável = ninguém → fora do ver_proprios de "outro"
      const seg = await http()
        .post('/crm/segmentos')
        .set(ADMIN)
        .send({ nome: 'escopo', alvo: 'LEAD', filtro: { estagio: ['QUALIFICADO'] } });

      const outro = await h.sujeitoCom(['lead:ver_proprios', 'segmento:ver']);
      const membros = await http()
        .get(`/crm/segmentos/${seg.body.id}/membros`)
        .set(bearer(outro.token));
      expect(membros.status).toBe(200);
      expect(membros.body.itens).toEqual([]);
    });

    it('sem segmento:ver → 403; sem segmento:gerir → 403 ao criar', async () => {
      const semNada = await h.sujeitoCom([]);
      const r1 = await http().get('/crm/segmentos').set(bearer(semNada.token));
      expect(r1.status).toBe(403);
      const r2 = await http()
        .post('/crm/segmentos')
        .set(bearer(semNada.token))
        .send({ nome: 'x', alvo: 'LEAD', filtro: {} });
      expect(r2.status).toBe(403);
    });
  });

  // ------------------------------------------------------------ guard/catálogo/regressão

  describe('guard, catálogo e regressão', () => {
    it('401 sem token; 403 sem permissão; 2xx com credencial de serviço', async () => {
      const semToken = await http().get('/crm/segmentos');
      expect(semToken.status).toBe(401);

      const semPerm = await h.sujeitoCom([]);
      const r = await http().post('/crm/interacoes').set(bearer(semPerm.token)).send({});
      expect(r.status).toBe(403);

      const ok = await http().get('/crm/tags').set(ADMIN);
      expect(ok.status).toBe(200);
    });

    it('catálogo ganha exatamente as 5 permissões novas', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      const ids = (res.body as { recurso: string; permissoes: { id: string }[] }[]).flatMap((g) =>
        g.permissoes.map((p) => p.id),
      );
      for (const id of [
        'interacao:registrar',
        'interacao:gerir',
        'segmento:ver',
        'segmento:gerir',
        'crm_admin:gerir_tags',
      ]) {
        expect(ids).toContain(id);
      }
    });

    it('/health continua afirmando 11 contextos', async () => {
      const res = await http().get('/health');
      expect(res.status).toBe(200);
      expect((res.body.contexts as unknown[]).length).toBe(11);
    });
  });
});
