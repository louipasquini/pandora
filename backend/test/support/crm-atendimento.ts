import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

/**
 * Helpers e2e da spec 012 (Chat ao Vivo). Constrói uma equipe `ATENDIMENTO`
 * sempre em expediente (janelas cobrindo os 7 dias da semana quase por
 * inteiro — `agoraUtc()` não é injetável nesta spec, por design, então o
 * teste garante o expediente aberto independentemente do horário real de
 * execução) com N atendentes ativos, tokens com permissões `atendimento:*`.
 */
export function crmAtendimentoHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader();

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function criarUsuario(): Promise<string> {
    const u = await http()
      .post('/admin/rbac/usuarios')
      .set(ADMIN)
      .send({ nome: 'Atendente', email: `atendente+${tag()}@x.com` });
    if (u.status !== 201) throw new Error(`criar usuario falhou ${u.status}: ${JSON.stringify(u.body)}`);
    return u.body.id as string;
  }

  async function tokenComPermissoes(perms: string[]): Promise<{ usuarioId: string; token: string }> {
    const usuarioId = await criarUsuario();
    if (perms.length > 0) {
      const p = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: `perfil-${tag()}`, permissoes: perms });
      if (p.status !== 201) throw new Error(`criar perfil falhou ${p.status}: ${JSON.stringify(p.body)}`);
      const put = await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p.body.id] });
      if (put.status >= 300) throw new Error(`atribuir perfil falhou ${put.status}`);
    }
    return { usuarioId, token: issueUserToken(usuarioId) };
  }

  async function criarEquipeAtendimento(): Promise<string> {
    const res = await http()
      .post('/crm/admin/equipes')
      .set(ADMIN)
      .send({ nome: `Atendimento ${tag()}`, tipo: 'ATENDIMENTO' });
    if (res.status !== 201) throw new Error(`criarEquipe falhou ${res.status}: ${JSON.stringify(res.body)}`);
    const equipeId = res.body.id as string;

    // Janela quase full-time (00:00–23:59) em todos os 7 dias — expediente
    // aberto para qualquer horário real de execução do teste.
    for (let dia = 0; dia <= 6; dia++) {
      const j = await http()
        .post('/crm/admin/janelas-atendimento')
        .set(ADMIN)
        .send({ equipeId, diaSemana: dia, horaInicio: '00:00', horaFim: '23:59' });
      if (j.status !== 201) throw new Error(`criarJanela falhou ${j.status}: ${JSON.stringify(j.body)}`);
    }
    return equipeId;
  }

  async function adicionarMembro(equipeId: string, usuarioId: string): Promise<void> {
    const r = await http()
      .post(`/crm/admin/equipes/${equipeId}/membros`)
      .set(ADMIN)
      .send({ usuarioId, papel: 'MEMBRO' });
    if (r.status !== 201) throw new Error(`adicionarMembro falhou ${r.status}: ${JSON.stringify(r.body)}`);
  }

  /**
   * Telefone único **desta spec** — DDD `21` (nunca usado pelo contador de
   * `crm-whatsapp.ts`, que usa `11`), com contador crescente próprio, para
   * não colidir mesmo que nenhum dos dois arquivos limpe `pessoa`/
   * `pessoaTelefone` no `afterEach` e a ordem de execução dos testes não seja
   * estritamente alfabética (o sequenciador padrão do Jest não garante isso).
   */
  let contadorTelefone = 0;
  function numeroUnico(): string {
    contadorTelefone += 1;
    const sufixo = String(contadorTelefone).padStart(8, '0');
    return `+5521${sufixo}`;
  }

  async function criarPessoaComTelefone(telefone: string, nome = 'Pessoa Atendimento') {
    const t = tag();
    const res = await http()
      .post('/pessoas')
      .set(ADMIN)
      .send({ nome, telefones: [telefone], emails: [`p+${t}@x.com`] });
    if (res.status !== 201) throw new Error(`criarPessoa falhou ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  return {
    http,
    ADMIN,
    numeroUnico,
    criarUsuario,
    tokenComPermissoes,
    criarEquipeAtendimento,
    adicionarMembro,
    criarPessoaComTelefone,
  };
}
