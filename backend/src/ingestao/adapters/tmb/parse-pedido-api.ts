import { montarResultado } from './montar';
import {
  dinheiroDeValorTmb,
  enderecoDeTmb,
  liquidoDe,
  soDigitos,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-tmb';
import type { ResultadoParseTmb } from './tipos';

type Rec = Record<string, unknown>;

function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function ocorridoDe(p: Rec): string {
  return textoOuUndefined(p.data_efetivado) ?? textoOuUndefined(p.criado_em) ?? '';
}

/**
 * Adapter TMB — **API `GET /api/pedidos`** (spec 019). "Consultar Pedidos
 * Efetivados", paginado. `id_origem = String(pedido_id)` (D-01). Campos de
 * comprador/valores idênticos ao webhook Vendas com os nomes da API (`pedido_id`,
 * `telefone` singular, `pais`, `cep`). Alguns retornos só trazem `valor_total` —
 * cai nele quando `valor_principal` está ausente (Assumption D-R8).
 */
export function parsePedidoApi(item: unknown): ResultadoParseTmb {
  const fonte = 'tmb.api' as const;
  if (!ehObjeto(item)) {
    return { tipoOrigem: fonte, payloadBruto: item, erros: ['item não é objeto'] };
  }
  const erros: string[] = [];
  const p = item;

  const bruto = dinheiroDeValorTmb(
    p.valor_principal ?? p.valor_total,
    erros,
    'valor_principal',
  );
  const taxas = dinheiroDeValorTmb(p.taxa_administracao, erros, 'taxa_administracao');

  return montarResultado(
    fonte,
    item,
    {
      idOrigem: textoOuUndefined(p.pedido_id),
      statusOrigem: textoOuUndefined(p.status_pedido) ?? '',
      ocorridoEm: ocorridoDe(p),
      comprador: {
        nome: textoOuUndefined(p.cliente),
        emails: textoOuUndefined(p.email) ? [String(p.email).trim()] : undefined,
        telefones: telefonesDeString(
          p.telefone as string | undefined,
          p.telefones as string | undefined,
        ),
        documentos: soDigitos(p.documento) ? [soDigitos(p.documento)] : undefined,
        endereco: enderecoDeTmb({
          logradouro: p.endereco_logradouro as string,
          numero: p.endereco_numero as string,
          complemento: p.endereco_complemento as string,
          bairro: p.endereco_bairro as string,
          cidade: p.endereco_cidade as string,
          uf: p.endereco_estado as string,
          cep: (p.cep ?? p.endereco_cep) as string,
          pais: (p.pais ?? p.endereco_pais) as string,
        }),
      },
      valores: { bruto, taxas, liquido: liquidoDe(bruto, taxas) },
      oferta: { nomeOrigem: textoOuUndefined(p.lancamento) ?? textoOuUndefined(p.titulo) },
    },
    erros,
  );
}
