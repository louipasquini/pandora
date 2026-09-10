import { montarResultado } from './montar';
import {
  dinheiroDeValorGuru,
  moedaDeGuru,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-guru';
import type { ContaGuru, ResultadoParseGuru } from './tipos';

/**
 * Divide **uma** linha de CSV respeitando aspas duplas (`""` = aspa literal).
 * Sem suporte a quebra de linha dentro de aspas (exports não têm — D-R12).
 * Cópia do `parse-linha-csv.ts` da spec 020.
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
  id: ['id', 'transacao', 'transação', 'codigo', 'código', 'codigo_transacao', 'código_transação', 'id_transacao'],
  status: ['status', 'situacao', 'situação'],
  gross: ['valor_bruto', 'valor bruto', 'gross', 'valor', 'valor_venda', 'valor da venda'],
  net: ['valor_liquido', 'valor líquido', 'valor liquido', 'net', 'liquido', 'líquido'],
  tax: ['taxa', 'taxas', 'valor_taxa', 'tax'],
  currency: ['moeda', 'currency'],
  ordered_at: ['data_pedido', 'data do pedido', 'ordered_at'],
  confirmed_at: ['data_aprovacao', 'data de aprovacao', 'data de aprovação', 'data_aprovação', 'confirmed_at'],
  created_at: ['data_criacao', 'data de criacao', 'data de criação', 'data_criação', 'created_at'],
  offer_code: ['codigo_oferta', 'código_oferta', 'offer_id', 'oferta_id', 'id_oferta'],
  offer_name: ['oferta', 'produto', 'nome_produto', 'nome do produto', 'product'],
  subscription: ['assinatura', 'subscription', 'tipo_produto', 'tipo de produto'],
  cycle: ['ciclo', 'cycle', 'numero_ciclo', 'número_ciclo'],
  type: ['tipo', 'type', 'tipo_venda', 'tipo da venda'],
  name: ['nome', 'cliente', 'comprador', 'nome do cliente'],
  email: ['email', 'e-mail'],
  doc: ['documento', 'cpf_cnpj', 'cpf/cnpj', 'cpf', 'cnpj', 'doc'],
  phone: ['telefone', 'celular', 'phone', 'fone'],
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
  conta: ContaGuru,
  valores: string[],
  idx: Record<string, number>,
  numeroLinha: number,
): ResultadoParseGuru {
  const erros: string[] = [];
  const g = (k: string): string | undefined =>
    idx[k] === undefined ? undefined : textoOuUndefined(valores[idx[k]]);

  const idOrigem = g('id');
  if (!idOrigem) {
    return {
      tipoOrigem: 'guru.csv',
      payloadBruto: { linha: numeroLinha, valores },
      erros: [`linha ${numeroLinha}: sem identificador de transação`],
    };
  }

  const moeda = moedaDeGuru(g('currency')) ?? 'BRL';
  const bruto = dinheiroDeValorGuru(g('gross'), erros, `linha ${numeroLinha} valor_bruto`, moeda);
  const liquido = dinheiroDeValorGuru(g('net'), erros, `linha ${numeroLinha} valor_liquido`, moeda);
  const taxaExplicita = dinheiroDeValorGuru(g('tax'), erros, `linha ${numeroLinha} taxa`, moeda);

  const assinaturaBruta = g('subscription');
  const ehRecorrencia =
    assinaturaBruta !== undefined && assinaturaBruta.toLowerCase() !== 'nao' &&
    assinaturaBruta.toLowerCase() !== 'não' && assinaturaBruta !== '0' &&
    assinaturaBruta.toLowerCase() !== 'false';
  const numeroCicloRaw = Number(g('cycle'));
  const numeroCiclo =
    ehRecorrencia && Number.isInteger(numeroCicloRaw) && numeroCicloRaw > 0
      ? numeroCicloRaw
      : undefined;

  return montarResultado(
    conta,
    'guru.csv',
    { linha: numeroLinha, valores },
    {
      idOrigem,
      statusOrigem: g('status') ?? '',
      ocorridoEm: g('confirmed_at') ?? g('ordered_at') ?? g('created_at') ?? '',
      valores: { bruto, liquido, taxas: taxasDe(bruto, liquido, taxaExplicita) },
      oferta: { codigoOrigem: g('offer_code'), nomeOrigem: g('offer_name') },
      assinaturaRecorrencia: ehRecorrencia,
      numeroCiclo,
      ehAfiliada: g('type')?.toLowerCase() === 'affiliate' ? true : undefined,
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
 * Adapter Guru — **CSV** de export de vendas (spec 021). Detecta separador
 * `,`/`;`, tira BOM, respeita aspas. 1 `ResultadoParseGuru` por linha de dado.
 * Linha sem identificador de transação → erro (não aborta o lote). Sem coluna de
 * id no cabeçalho → toda linha vira erro. Nunca lança. O CSV **traz o comprador**
 * (colunas `nome`/`email`/`documento`/`telefone`).
 */
export function parseCsvGuru(
  conteudo: string,
  conta: ContaGuru,
): ResultadoParseGuru[] {
  const texto = conteudo.replace(/^\uFEFF/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return [];

  const sep = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], sep).map((h) => h.toLowerCase());
  const idx = indexarCabecalho(cabecalho);

  return linhas.slice(1).map((linha, i) =>
    montarLinha(conta, dividirLinha(linha, sep), idx, i + 2),
  );
}
