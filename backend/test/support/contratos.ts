import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader } from './auth';

/** Tag AEN dedicada aos e2e de `contratos` (spec 025) — produto próprio
 *  ("CTR"), turma perpétua ("00"), para não disputar estado com as fixtures
 *  default ("PCS48XAV") de outras suítes e2e que compartilham o mesmo schema. */
export const TAG_CONTRATOS = 'CTR00XAV';

export function contratosHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());

  return {
    async listar(qs = '', token?: string) {
      return http().get(`/contratos${qs ? `?${qs}` : ''}`).set(authHeader(token));
    },
    async detalhe(id: string, token?: string) {
      return http().get(`/contratos/${id}`).set(authHeader(token));
    },
    async ajustar(id: string, body: Record<string, unknown>, token?: string) {
      return http().patch(`/contratos/${id}`).set(authHeader(token)).send(body);
    },
    /** Curadoria de `oferta_catalogo` via `PATCH /ofertas/:id` (spec 023). */
    async curarTempoAcesso(ofertaId: string, tempoAcessoDias: number, token?: string) {
      return http()
        .patch(`/ofertas/${ofertaId}`)
        .set(authHeader(token))
        .send({ catalogo: { tempoAcessoDias } });
    },
  };
}
