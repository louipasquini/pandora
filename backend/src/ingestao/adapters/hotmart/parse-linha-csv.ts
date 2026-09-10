import { montarResultado } from './montar';
import {
  dinheiroDeValorHotmart,
  moedaDeHotmart,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-hotmart';
import type { ContaHotmart, ResultadoParseHotmart } from './tipos';

/**
 * Divide **uma** linha de CSV respeitando aspas duplas (`""` = aspa literal).
 * Sem suporte a quebra de linha dentro de aspas (exports não têm — research.md
 * D-R12). Cópia do `parse-linha-csv.ts` da spec 021.
 */
function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let emAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (emAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          emAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      emAspas = true;
    } else if (c === sep) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((s) => s.trim());
}

/** `,` vs `;` — o que mais aparece no cabeçalho vence; empate → `,`. */
function detectarSeparador(cabecalho: string): string {
  const virgulas = (cabecalho.match(/,/g) ?? []).length;
  const pontosVirgula = (cabecalho.match(/;/g) ?? []).length;
  return pontosVirgula > virgulas ? ';' : ',';
}

/** Coluna canônica → aliases aceitos (tudo minúsculo). */
const ALIASES: Record<string, string[]> = {
  id: ['transacao', 'transação', 'transaction', 'codigo', 'código', 'id', 'id_transacao', 'codigo_transacao'],
  status: ['status', 'situacao', 'situação'],
  gross: ['valor', 'valor_bruto', 'valor bruto', 'valor da venda', 'gross', 'price'],
  net: ['valor_liquido', 'valor líquido', 'valor liquido', 'net', 'liquido', 'líquido'],
  tax: ['taxa', 'taxas', 'valor_taxa', 'hotmart_fee', 'fee'],
  currency: ['moeda', 'currency', 'currency_code'],
  order_at: ['data_pedido', 'data do pedido', 'order_date', 'ordered_at'],
  approved_at: ['data_aprovacao', 'data de aprovacao', 'data de aprovação', 'data_aprovação', 'approved_date'],
  created_at: ['data_criacao', 'data de criacao', 'data de criação', 'data_criação', 'created_at'],
  offer_code: ['codigo_oferta', 'código_oferta', 'offer_code', 'offer_id', 'oferta_id', 'id_oferta'],
  offer_name: ['oferta', 'produto', 'nome_produto', 'nome do produto', 'product'],
  subscription: ['assinatura', 'subscription', 'is_subscription', 'recorrente'],
  cycle: ['ciclo', 'cycle', 'recurrency_number', 'numero_ciclo', 'número_ciclo'],
  commission_as: ['comissao', 'comissão', 'tipo', 'type', 'commission_as', 'papel'],
  name: ['nome', 'cliente', 'comprador', 'nome do cliente', 'buyer_name'],
  email: ['email', 'e-mail', 'buyer_email'],
  doc: ['documento', 'cpf_cnpj', 'cpf/cnpj', 'cpf', 'cnpj', 'doc', 'document'],
  phone: ['telefone', 'celular', 'phone', 'fone', 'checkout_phone'],
};

/** Constrói o índice coluna-canônica → posição a partir do cabeçalho lido. */
function indexarCabecalho(cabecalho: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (const [canonica, aliases] of Object.entries(ALIASES)) {
    const pos = cabecalho.findIndex((h) => aliases.includes(h));
    if (pos >= 0) idx[canonica] = pos;
  }
  return idx;
}

function montarLinha(
  conta: ContaHotmart,
  valores: string[],
  idx: Record<string, number>,
  numeroLinha: number,
): ResultadoParseHotmart {
  const erros: string[] = [];
  const g = (k: string): string | undefined =>
    idx[k] === undefined ? undefined : textoOuUndefined(valores[idx[k]]);

  const idOrigem = g('id');
  if (!idOrigem) {
    return {
      tipoOrigem: 'hotmart.csv',
      payloadBruto: { linha: numeroLinha, valores },
      erros: [`linha ${numeroLinha}: sem identificador de transação`],
    };
  }

  const moeda = moedaDeHotmart(g('currency')) ?? 'BRL';
  const bruto = dinheiroDeValorHotmart(g('gross'), erros, `linha ${numeroLinha} valor`, moeda);
  const liquido = dinheiroDeValorHotmart(
    g('net'),
    erros,
    `linha ${numeroLinha} valor_liquido`,
    moeda,
  );
  const taxaExplicita = dinheiroDeValorHotmart(g('tax'), erros, `linha ${numeroLinha} taxa`, moeda);

  const assinaturaBruta = g('subscription');
  const ehRecorrencia =
    assinaturaBruta !== undefined &&
    !['nao', 'não', '0', 'false', 'no'].includes(assinaturaBruta.toLowerCase());
  const numeroCicloRaw = Number(g('cycle'));
  const numeroCiclo =
    ehRecorrencia && Number.isInteger(numeroCicloRaw) && numeroCicloRaw > 1
      ? numeroCicloRaw
      : undefined;

  return montarResultado(
    conta,
    'hotmart.csv',
    { linha: numeroLinha, valores },
    {
      idOrigem,
      statusOrigem: g('status') ?? '',
      ocorridoEm: g('approved_at') ?? g('order_at') ?? g('created_at') ?? '',
      valores: { bruto, liquido, taxas: taxasDe(bruto, liquido, taxaExplicita) },
      oferta: { codigoOrigem: g('offer_code'), nomeOrigem: g('offer_name') },
      assinaturaRecorrencia: ehRecorrencia,
      numeroCiclo,
      ehAfiliada: g('commission_as')?.toUpperCase() === 'AFFILIATE' ? true : undefined,
      comprador: {
        nome: g('name'),
        emails: g('email') ? [g('email') as string] : undefined,
        documentos: soDigitos(g('doc')) ? [soDigitos(g('doc'))] : undefined,
        telefones: telefonesDeString(g('phone')),
      },
    },
    erros,
  );
}

/**
 * Adapter Hotmart — **CSV** de export de vendas (spec 022). Detecta separador
 * `,`/`;`, tira BOM, respeita aspas. 1 `ResultadoParseHotmart` por linha de dado.
 * Linha sem identificador de transação → erro (não aborta o lote). Sem coluna de
 * id no cabeçalho → toda linha vira erro. Nunca lança. O CSV **traz o comprador**
 * (colunas `nome`/`email`/`documento`/`telefone`).
 */
export function parseCsvHotmart(
  conteudo: string,
  conta: ContaHotmart,
): ResultadoParseHotmart[] {
  const texto = conteudo.replace(/^\uFEFF/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return [];

  const sep = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], sep).map((h) => h.toLowerCase());
  const idx = indexarCabecalho(cabecalho);

  return linhas
    .slice(1)
    .map((linha, i) => montarLinha(conta, dividirLinha(linha, sep), idx, i + 2));
}
