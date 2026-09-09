import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUGESTAO_IA_CLIENT } from '../src/crm/application/sugestao-ia';
import { authHeader } from './support/auth';
import { crmAtendimentoHelpers } from './support/crm-atendimento';
import { criarSugestaoIaDublê, type SugestaoIaDublê } from './support/crm-sugestao-ia';

/**
 * spec 013 — FAQ e Sugestão de IA (e2e, Postgres real). FAQ versionada
 * (FR-001/FR-002), geração síncrona de sugestão sobre uma `Interacao` de
 * entrada já existente (FR-003/FR-004/FR-006/FR-013/FR-014), decisão humana
 * (RESPOSTA nunca envia sozinha — D-R6; CAMPO_PERSONALIZADO grava ao aceitar,
 * lead e pessoa), D-05 (substituição), feedback pós-decisão, guard 401/403,
 * regressão `context-modules.e2e-spec.ts` (11 contextos).
 */
describe('crm — FAQ e Sugestão de IA (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let h: ReturnType<typeof crmAtendimentoHelpers>;
  let dublê: SugestaoIaDublê;
  const ADMIN = authHeader();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    dublê = criarSugestaoIaDublê();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUGESTAO_IA_CLIENT)
      .useValue(dublê)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    h = crmAtendimentoHelpers(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    dublê.proximoTextoBruto = '[]';
    dublê.falharProxima = null;
    dublê.prompts = [];
    await prisma.sugestaoIa.deleteMany({});
    await prisma.respostaAtendimento.deleteMany({});
    await prisma.atendimento.deleteMany({});
    await prisma.interacao.deleteMany({});
    await prisma.faqItemVersao.deleteMany({});
    await prisma.faqItem.deleteMany({});
    await prisma.valorCampoPessoa.deleteMany({});
    await prisma.campoPersonalizadoPessoa.deleteMany({});
    await prisma.valorCampoLead.deleteMany({});
    await prisma.campoPersonalizadoLead.deleteMany({});
    await prisma.integracao.deleteMany({});
    await prisma.crmAdminAudit.deleteMany({});
    await prisma.clientesAudit.deleteMany({});
  });

  async function tokenAtender() {
    return h.tokenComPermissoes(['atendimento:atender', 'atendimento:ver_proprios']);
  }

  async function criarAtendimentoPessoa(pessoaId: string) {
    const res = await http().post('/crm/atendimentos').set(ADMIN).send({ pessoaId });
    if (res.status !== 201) throw new Error(`criar atendimento falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.atendimentoId as string;
  }

  async function assumir(atendimentoId: string, token: string) {
    const res = await http()
      .post(`/crm/atendimentos/${atendimentoId}/assumir`)
      .set({ Authorization: `Bearer ${token}` });
    if (res.status !== 201) throw new Error(`assumir falhou ${res.status}: ${JSON.stringify(res.body)}`);
  }

  async function criarInteracaoEntrada(pessoaId: string, atendimentoId: string, conteudo: string) {
    const res = await http()
      .post('/crm/interacoes')
      .set(ADMIN)
      .send({ pessoaId, tipo: 'TICKET', direcao: 'ENTRADA', conteudo });
    if (res.status !== 201) throw new Error(`criar interacao falhou ${res.status}: ${JSON.stringify(res.body)}`);
    const interacaoId = res.body.id as string;
    await prisma.interacao.update({ where: { id: interacaoId }, data: { atendimentoId } });
    return interacaoId;
  }

  // --------------------------------------------------------------------- FAQ

  describe('FAQ (FR-001/FR-002)', () => {
    it('cria, edita (gera versão), lista o catálogo só com ativos', async () => {
      const criar = await http()
        .post('/crm/admin/faq')
        .set(ADMIN)
        .send({ pergunta: 'Qual o prazo de acesso?', resposta: '12 meses.' });
      expect(criar.status).toBe(201);
      const id = criar.body.id as string;

      const editar = await http()
        .patch(`/crm/admin/faq/${id}`)
        .set(ADMIN)
        .send({ resposta: '12 meses corridos a partir da compra.' });
      expect(editar.status).toBe(200);
      expect(editar.body.resposta).toBe('12 meses corridos a partir da compra.');

      const versoes = await http().get(`/crm/admin/faq/${id}/versoes`).set(ADMIN);
      expect(versoes.status).toBe(200);
      expect(versoes.body.itens).toHaveLength(2);
      expect(versoes.body.itens[0].resposta).toBe('12 meses corridos a partir da compra.');

      const catalogo = await http().get('/crm/faq').set(ADMIN);
      expect(catalogo.status).toBe(200);
      expect(catalogo.body.itens.map((i: { id: string }) => i.id)).toContain(id);

      await http().patch(`/crm/admin/faq/${id}`).set(ADMIN).send({ ativo: false });
      const catalogoDepois = await http().get('/crm/faq').set(ADMIN);
      expect(catalogoDepois.body.itens.map((i: { id: string }) => i.id)).not.toContain(id);

      // desativar não gera nova versão (só conteúdo gera)
      const versoesDepois = await http().get(`/crm/admin/faq/${id}/versoes`).set(ADMIN);
      expect(versoesDepois.body.itens).toHaveLength(2);
    });

    it('sem crm_admin:gerir_faq → 403 na escrita; sem token → 401', async () => {
      const { token } = await h.tokenComPermissoes([]);
      const semPerm = await http()
        .post('/crm/admin/faq')
        .set({ Authorization: `Bearer ${token}` })
        .send({ pergunta: 'x', resposta: 'y' });
      expect(semPerm.status).toBe(403);

      const semToken = await http().get('/crm/faq');
      expect(semToken.status).toBe(401);
    });
  });

  // ------------------------------------------------------------- sugestão de resposta

  describe('sugestão de resposta (FR-003/FR-004/FR-005/FR-006/FR-013/FR-014)', () => {
    it('gera sugestão a partir de uma FAQ ativa e nunca envia ao aceitar', async () => {
      const faq = await http()
        .post('/crm/admin/faq')
        .set(ADMIN)
        .send({ pergunta: 'Posso parcelar?', resposta: 'Em até 12x.' });
      const faqItemId = faq.body.id as string;

      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Posso parcelar em quantas vezes?');

      dublê.proximoTextoBruto = JSON.stringify([
        {
          tipo: 'RESPOSTA',
          perguntaDetectada: 'Posso parcelar em quantas vezes?',
          conteudoSugerido: 'Em até 12x no cartão.',
          faqItemId,
        },
      ]);

      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      expect(gerar.status).toBe(201);
      expect(gerar.body.itens).toHaveLength(1);
      const sugestaoId = gerar.body.itens[0].id as string;
      expect(gerar.body.itens[0]).toMatchObject({ tipo: 'RESPOSTA', faqItemId, status: 'PENDENTE' });

      const aceitar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/aceitar`)
        .set({ Authorization: `Bearer ${token}` })
        .send({});
      expect(aceitar.status).toBe(201);
      expect(aceitar.body.status).toBe('ACEITA');

      // nada foi enviado ainda — nenhuma resposta registrada
      const semEnvio = await prisma.respostaAtendimento.findMany({ where: { atendimentoId } });
      expect(semEnvio).toHaveLength(0);

      const responder = await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ conteudo: 'Em até 12x no cartão.', sugestaoId });
      expect(responder.status).toBe(201);

      const resposta = await prisma.respostaAtendimento.findFirst({ where: { atendimentoId } });
      expect(resposta?.viaIa).toBe(true);
      expect(resposta?.sugestaoIaId).toBe(sugestaoId);
    });

    it('sem correspondência na FAQ → nenhuma sugestão de baixa confiança (FR-006)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Pergunta sem FAQ correspondente');

      dublê.proximoTextoBruto = '[]';
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      expect(gerar.status).toBe(201);
      expect(gerar.body.itens).toHaveLength(0);
    });

    it('múltiplas perguntas numa mensagem geram sugestões separadas, decidíveis independentemente (US3)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(
        pessoaId,
        atendimentoId,
        'Qual o prazo? E posso parcelar?',
      );

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: '12 meses.' },
        { tipo: 'RESPOSTA', perguntaDetectada: 'Posso parcelar?', conteudoSugerido: 'Em até 12x.' },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      expect(gerar.body.itens).toHaveLength(2);

      const [a, b] = gerar.body.itens as { id: string }[];
      const aceitar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${a.id}/aceitar`)
        .set({ Authorization: `Bearer ${token}` })
        .send({});
      expect(aceitar.status).toBe(201);
      const rejeitar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${b.id}/rejeitar`)
        .set({ Authorization: `Bearer ${token}` });
      expect(rejeitar.status).toBe(201);

      const lista = await http()
        .get(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` });
      const porId = new Map(lista.body.itens.map((i: { id: string; status: string }) => [i.id, i.status]));
      expect(porId.get(a.id)).toBe('ACEITA');
      expect(porId.get(b.id)).toBe('REJEITADA');
    });

    it('nova sugestão para a mesma mensagem substitui a pendente anterior (D-05)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Qual o prazo?');

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: 'primeira tentativa' },
      ]);
      const primeira = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      const primeiraId = primeira.body.itens[0].id as string;

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: 'segunda tentativa' },
      ]);
      await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });

      const anterior = await prisma.sugestaoIa.findUnique({ where: { id: primeiraId } });
      expect(anterior?.status).toBe('SUBSTITUIDA');
    });

    it('falha do provedor de IA nunca bloqueia o atendimento (FR-014/SC-006)', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Qualquer pergunta');

      dublê.falharProxima = 'credencial_nao_configurada';
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      expect(gerar.status).toBe(201);
      expect(gerar.body.itens).toHaveLength(0);
      expect(gerar.body.aviso).toBe('credencial_nao_configurada');

      const responder = await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ conteudo: 'Resposta manual, sem IA.' });
      expect(responder.status).toBe(201);
    });

    it('interacao inválida (de outro atendimento, ou SAIDA) → 422', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);

      const saida = await http()
        .post('/crm/interacoes')
        .set(ADMIN)
        .send({ pessoaId, tipo: 'TICKET', direcao: 'SAIDA', conteudo: 'oi' });
      await prisma.interacao.update({ where: { id: saida.body.id }, data: { atendimentoId } });

      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId: saida.body.id });
      expect(gerar.status).toBe(422);
    });

    it('sugestaoId inválido (pendente, rejeitada, ou de outro atendimento) no responder → 409', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Qual o prazo?');

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: '12 meses.' },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      const sugestaoId = gerar.body.itens[0].id as string;

      // ainda PENDENTE — não pode ser usada no responder
      const respostaPendente = await http()
        .post(`/crm/atendimentos/${atendimentoId}/responder`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ conteudo: 'x', sugestaoId });
      expect(respostaPendente.status).toBe(409);
    });
  });

  // ---------------------------------------------------------- campo personalizado

  describe('sugestão de campo personalizado (FR-007/FR-008/FR-009)', () => {
    it('aceitar grava direto no cadastro de uma pessoa já convertida', async () => {
      const campo = await http()
        .post('/clientes/admin/campos-personalizados')
        .set(ADMIN)
        .send({ chave: 'anos_experiencia', rotulo: 'Anos de experiência', tipo: 'NUMERO' });
      expect(campo.status).toBe(201);

      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await h.tokenComPermissoes(['atendimento:atender', 'pessoa:editar']);
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(
        pessoaId,
        atendimentoId,
        'Sou nutricionista há 5 anos',
      );

      dublê.proximoTextoBruto = JSON.stringify([
        {
          tipo: 'CAMPO_PERSONALIZADO',
          perguntaDetectada: null,
          conteudoSugerido: '5',
          campoPersonalizadoChave: 'anos_experiencia',
        },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      expect(gerar.body.itens).toHaveLength(1);
      const sugestaoId = gerar.body.itens[0].id as string;
      expect(gerar.body.itens[0].campoPersonalizadoPessoaId).toBe(campo.body.id);

      const aceitar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/aceitar`)
        .set({ Authorization: `Bearer ${token}` })
        .send({});
      expect(aceitar.status).toBe(201);

      const valores = await http().get(`/pessoas/${pessoaId}/campos-personalizados`).set(ADMIN);
      expect(valores.body).toEqual({ anos_experiencia: '5' });
    });

    it('sem pessoa:editar → 403 ao aceitar, mesmo com atendimento:atender', async () => {
      await http()
        .post('/clientes/admin/campos-personalizados')
        .set(ADMIN)
        .send({ chave: 'anos_experiencia2', rotulo: 'Anos de experiência', tipo: 'NUMERO' });

      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, '5 anos de experiência');

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'CAMPO_PERSONALIZADO', conteudoSugerido: '5', campoPersonalizadoChave: 'anos_experiencia2' },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      const sugestaoId = gerar.body.itens[0].id as string;

      const aceitar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/aceitar`)
        .set({ Authorization: `Bearer ${token}` })
        .send({});
      expect(aceitar.status).toBe(403);
    });

    it('aceitar campo personalizado de um lead grava em valor_campo_lead (mesmo destino da 008)', async () => {
      const campo = await http()
        .post('/crm/admin/campos-lead')
        .set(ADMIN)
        .send({ chave: 'origem_indicacao', rotulo: 'Indicação', tipo: 'TEXTO' });
      expect(campo.status).toBe(201);

      const lead = await http()
        .post('/crm/leads')
        .set(ADMIN)
        .send({ nome: 'Lead Teste', email: `lead+${Date.now()}@x.com` });
      expect(lead.status).toBe(201);
      const leadId = lead.body.id as string;

      const atend = await http().post('/crm/atendimentos').set(ADMIN).send({ leadId });
      const atendimentoId = atend.body.atendimentoId as string;
      const { token } = await h.tokenComPermissoes(['atendimento:atender', 'lead:editar']);
      await assumir(atendimentoId, token);

      const interacaoRes = await http()
        .post('/crm/interacoes')
        .set(ADMIN)
        .send({ leadId, tipo: 'TICKET', direcao: 'ENTRADA', conteudo: 'Vim por indicação da Maria' });
      const interacaoId = interacaoRes.body.id as string;
      await prisma.interacao.update({ where: { id: interacaoId }, data: { atendimentoId } });

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'CAMPO_PERSONALIZADO', conteudoSugerido: 'Maria', campoPersonalizadoChave: 'origem_indicacao' },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      const sugestaoId = gerar.body.itens[0].id as string;
      expect(gerar.body.itens[0].campoPersonalizadoLeadId).toBe(campo.body.id);

      await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/aceitar`)
        .set({ Authorization: `Bearer ${token}` })
        .send({});

      const valores = await http().get(`/crm/leads/${leadId}/campos-personalizados`).set(ADMIN);
      expect(valores.body).toEqual({ origem_indicacao: 'Maria' });
    });
  });

  // -------------------------------------------------------------------- feedback

  describe('feedback de utilidade (US5)', () => {
    it('só aceita depois de decidida; idempotente', async () => {
      const pessoaId = await h.criarPessoaComTelefone(h.numeroUnico());
      const atendimentoId = await criarAtendimentoPessoa(pessoaId);
      const { token } = await tokenAtender();
      await assumir(atendimentoId, token);
      const interacaoId = await criarInteracaoEntrada(pessoaId, atendimentoId, 'Qual o prazo?');

      dublê.proximoTextoBruto = JSON.stringify([
        { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: '12 meses.' },
      ]);
      const gerar = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ interacaoId });
      const sugestaoId = gerar.body.itens[0].id as string;

      const cedo = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/feedback`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ util: true });
      expect(cedo.status).toBe(409);

      await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/rejeitar`)
        .set({ Authorization: `Bearer ${token}` });

      const feedback = await http()
        .post(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/feedback`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ util: false });
      expect(feedback.status).toBe(201);
      expect(feedback.body.util).toBe(false);
    });
  });

});
