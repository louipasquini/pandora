import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader } from './auth';

export function catalogoHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());

  return {
    async listarProdutos(qs = '') {
      return http()
        .get(`/produtos${qs ? `?${qs}` : ''}`)
        .set(authHeader());
    },
    async produtoPorCodigo(codigo: string) {
      return http().get(`/produtos/${codigo}`).set(authHeader());
    },
    async curarProduto(codigo: string, body: Record<string, unknown>) {
      return http().put(`/produtos/${codigo}`).set(authHeader()).send(body);
    },

    async listarOfertas(qs = '') {
      return http()
        .get(`/ofertas${qs ? `?${qs}` : ''}`)
        .set(authHeader());
    },
    async ofertaPorId(id: string) {
      return http().get(`/ofertas/${id}`).set(authHeader());
    },
    async criarOferta(body: Record<string, unknown>) {
      return http().post('/ofertas').set(authHeader()).send(body);
    },
    async curarOferta(id: string, body: Record<string, unknown>) {
      return http().patch(`/ofertas/${id}`).set(authHeader()).send(body);
    },

    async importarProdutosCsv(csv: string) {
      return http()
        .post('/catalogo/hotmart/importar-produtos')
        .set(authHeader())
        .send({ csv });
    },
    async importarOfertasCsv(csv: string, conta: 'HOTMART_PRD' | 'HOTMART_SVC') {
      return http()
        .post('/catalogo/hotmart/importar-ofertas')
        .set(authHeader())
        .send({ csv, conta });
    },
    async importarLancamentosCsv(csv: string) {
      return http()
        .post('/catalogo/hotmart/importar-lancamentos')
        .set(authHeader())
        .send({ csv });
    },
  };
}
