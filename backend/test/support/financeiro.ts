import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, issueUserToken } from './auth';

type Json = Record<string, unknown>;

/** Monta um `EventoCanonico` de venda própria (defaults sensatos). */
export function montarCanonico(over: Json = {}): Json {
  return {
    plataformaOrigem: 'GURU_PRD',
    idOrigem: 'txn_fin_1',
    tipoOrigem: 'guru.webhook',
    statusOrigem: 'PAGO',
    ocorridoEm: '2026-08-30T14:02:00Z',
    comprador: { nome: 'Fulana de Tal', emails: ['fulana@example.com'] },
    valores: { bruto: { valorInteiro: '19700000', moeda: 'BRL' } },
    oferta: { codigoOrigem: 'PCS48XAV', quantidade: 1 },
    ...over,
  };
}

export function financeiroHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());

  return {
    /** Ingere um evento e roda 1 passada do worker. Retorna `{ eventoId, resumo }`. */
    async ingerirEProcessar(opts: {
      plataformaOrigem?: string;
      tipoOrigem?: string;
      idOrigem?: string;
      payloadBruto?: unknown;
      eventoCanonico?: Json | null;
      canonicoOver?: Json;
    } = {}) {
      const idOrigem =
        opts.idOrigem ?? `txn_${Math.random().toString(36).slice(2, 10)}`;
      const plataformaOrigem = opts.plataformaOrigem ?? 'GURU_PRD';
      const tipoOrigem = opts.tipoOrigem ?? 'guru.webhook';
      const eventoCanonico =
        opts.eventoCanonico === null
          ? undefined
          : (opts.eventoCanonico ??
            montarCanonico({
              plataformaOrigem,
              tipoOrigem,
              idOrigem,
              ...(opts.canonicoOver ?? {}),
            }));
      const body: Json = {
        plataformaOrigem,
        tipoOrigem,
        idOrigem,
        payloadBruto: opts.payloadBruto ?? { id: idOrigem },
      };
      if (eventoCanonico) body.eventoCanonico = eventoCanonico;

      const ing = await http()
        .post('/ingestao/eventos')
        .set(authHeader())
        .send(body);
      const eventoId = ing.body.eventoId as string;
      const proc = await http()
        .post('/ingestao/eventos/processar')
        .set(authHeader());
      return { eventoId, idOrigem, plataformaOrigem, resumo: proc.body };
    },

    async reprocessar(eventoId: string, forcar = false) {
      return http()
        .post(`/ingestao/eventos/${eventoId}/reprocessar`)
        .set(authHeader())
        .send({ forcar });
    },

    async processar() {
      return http().post('/ingestao/eventos/processar').set(authHeader());
    },

    async eventoDetalhe(id: string) {
      return http().get(`/ingestao/eventos/${id}`).set(authHeader());
    },

    async listar(qs = '') {
      return http()
        .get(`/financeiro/transacoes${qs ? `?${qs}` : ''}`)
        .set(authHeader());
    },

    async detalhe(id: string) {
      return http().get(`/financeiro/transacoes/${id}`).set(authHeader());
    },

    async tentarVincular(id: string, token?: string) {
      return http()
        .post(`/financeiro/transacoes/${id}/tentar-vincular`)
        .set(authHeader(token));
    },

    async tentarVincularPendentes(token?: string) {
      return http()
        .post('/financeiro/transacoes/tentar-vincular-pendentes')
        .set(authHeader(token));
    },

    /** `{ token }` de um `Usuario` com exatamente `perms` (via /admin/rbac). */
    async sujeitoCom(perms: string[]): Promise<{ token: string; usuarioId: string }> {
      const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const u = await http()
        .post('/admin/rbac/usuarios')
        .set(authHeader())
        .send({ nome: `fin-${tag}`, email: `fin+${tag}@x.com` });
      const usuarioId = u.body.id as string;
      if (perms.length > 0) {
        const p = await http()
          .post('/admin/rbac/perfis')
          .set(authHeader())
          .send({ nome: `perfil-fin-${tag}`, permissoes: perms });
        await http()
          .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
          .set(authHeader())
          .send({ perfilIds: [p.body.id] });
      }
      return { token: issueUserToken(usuarioId), usuarioId };
    },
  };
}
