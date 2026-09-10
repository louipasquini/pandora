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

/** Objeto genérico — a doc da TMB avisa que novos campos podem surgir; ignoramos. */
type Rec = Record<string, unknown>;

function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `data_efetivado` se presente, senão `criado_em`, senão `''` (D-09). */
function ocorridoDe(p: Rec): string {
  return (
    textoOuUndefined(p.data_efetivado) ?? textoOuUndefined(p.criado_em) ?? ''
  );
}

/**
 * Adapter TMB — **webhook de Vendas** (spec 019). Payload achatado, campo de
 * status `status_pedido`, gatilhos "Efetivado" / "Cancelado". Puro; nunca lança.
 * `pedido` (int) é a chave natural `id_origem` (D-01); `id_externo` fica só no
 * `payload_bruto`.
 */
export function parseWebhookVendas(payload: unknown): ResultadoParseTmb {
  const fonte = 'tmb.webhook-vendas' as const;
  if (!ehObjeto(payload)) {
    return { tipoOrigem: fonte, payloadBruto: payload, erros: ['payload não é objeto'] };
  }
  const erros: string[] = [];
  const p = payload;

  const idOrigem = textoOuUndefined(p.pedido);
  const bruto = dinheiroDeValorTmb(p.valor_principal, erros, 'valor_principal');
  const taxas = dinheiroDeValorTmb(p.taxa_administracao, erros, 'taxa_administracao');

  return montarResultado(
    fonte,
    payload,
    {
      idOrigem,
      statusOrigem: textoOuUndefined(p.status_pedido) ?? '',
      ocorridoEm: ocorridoDe(p),
      comprador: {
        nome: textoOuUndefined(p.cliente),
        emails: textoOuUndefined(p.email) ? [String(p.email).trim()] : undefined,
        telefones: telefonesDeString(
          p.telefones as string | undefined,
          p.telefone_ativo as string | undefined,
        ),
        documentos: soDigitos(p.documento) ? [soDigitos(p.documento)] : undefined,
        endereco: enderecoDeTmb({
          logradouro: p.endereco_logradouro as string,
          numero: p.endereco_numero as string,
          complemento: p.endereco_complemento as string,
          bairro: p.endereco_bairro as string,
          cidade: p.endereco_cidade as string,
          uf: p.endereco_estado as string,
          cep: p.endereco_cep as string,
          pais: p.endereco_pais as string,
        }),
      },
      valores: { bruto, taxas, liquido: liquidoDe(bruto, taxas) },
      oferta: {
        nomeOrigem: textoOuUndefined(p.titulo) ?? textoOuUndefined(p.code),
      },
    },
    erros,
  );
}
