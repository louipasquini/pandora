import { montarResultado } from './montar';
import {
  dinheiroDeValorAsaas,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-asaas';
import type { ContaAsaas, ResultadoParseAsaas } from './tipos';

/**
 * Divide **uma** linha de CSV respeitando aspas duplas (`""` = aspa literal).
 * Sem suporte a quebra de linha dentro de aspas (exports não têm — D-R14).
 * Cópia do `parse-linha-csv.ts` da spec 019.
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
  id: ['id', 'identificador', 'cobranca', 'cobrança'],
  status: ['status', 'situacao', 'situação'],
  value: ['value', 'valor'],
  netvalue: ['netvalue', 'valor_liquido', 'valor liquido', 'valor líquido'],
  datecreated: ['datecreated', 'data_criacao', 'data de criacao', 'data de criação'],
  paymentdate: ['paymentdate', 'data_pagamento', 'data de pagamento'],
  duedate: ['duedate', 'vencimento', 'data de vencimento'],
  description: ['description', 'descricao', 'descrição'],
  externalreference: ['externalreference', 'referencia_externa', 'referência externa', 'referencia externa'],
  subscription: ['subscription', 'assinatura', 'id da assinatura'],
  customer: ['customer', 'cliente', 'nome do cliente'],
  email: ['email', 'e-mail'],
  cpfcnpj: ['cpfcnpj', 'cpf_cnpj', 'cpf/cnpj', 'cpf', 'cnpj', 'documento'],
  phone: ['phone', 'telefone', 'celular'],
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
  conta: ContaAsaas,
  valores: string[],
  idx: Record<string, number>,
  numeroLinha: number,
): ResultadoParseAsaas {
  const erros: string[] = [];
  const g = (k: string): string | undefined =>
    idx[k] === undefined ? undefined : textoOuUndefined(valores[idx[k]]);

  const idOrigem = g('id');
  if (!idOrigem) {
    return {
      tipoOrigem: 'asaas.csv',
      payloadBruto: { linha: numeroLinha, valores },
      erros: [`linha ${numeroLinha}: sem identificador de cobrança`],
    };
  }

  const bruto = dinheiroDeValorAsaas(g('value'), erros, `linha ${numeroLinha} value`);
  const liquido = dinheiroDeValorAsaas(
    g('netvalue'),
    erros,
    `linha ${numeroLinha} netValue`,
  );

  return montarResultado(
    conta,
    'asaas.csv',
    { linha: numeroLinha, valores },
    {
      idOrigem,
      statusOrigem: g('status') ?? '',
      ocorridoEm: g('paymentdate') ?? g('datecreated') ?? g('duedate') ?? '',
      valores: { bruto, liquido, taxas: taxasDe(bruto, liquido) },
      referenciaExternaIdOrigem: g('externalreference'),
      assinaturaRecorrencia: g('subscription') !== undefined,
      oferta: { nomeOrigem: g('description') },
      comprador: {
        nome: g('customer'),
        emails: g('email') ? [g('email') as string] : undefined,
        documentos: soDigitos(g('cpfcnpj')) ? [soDigitos(g('cpfcnpj'))] : undefined,
        telefones: telefonesDeString(g('phone')),
      },
    },
    erros,
  );
}

/**
 * Adapter Asaas — **CSV** de export de cobranças (spec 020). Detecta separador
 * `,`/`;`, tira BOM, respeita aspas. 1 `ResultadoParseAsaas` por linha de dado.
 * Linha sem identificador de cobrança → erro (não aborta o lote). Sem coluna de
 * id no cabeçalho → toda linha vira erro. Nunca lança. Diferente do webhook/API,
 * o CSV **traz o comprador** (colunas `cliente`/`email`/`cpf_cnpj`/`telefone`).
 */
export function parseCsvAsaas(
  conteudo: string,
  conta: ContaAsaas,
): ResultadoParseAsaas[] {
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
