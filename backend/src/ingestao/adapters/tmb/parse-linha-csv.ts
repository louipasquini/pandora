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

/**
 * Divide **uma** linha de CSV respeitando aspas duplas (`""` = aspa literal).
 * Sem suporte a quebra de linha dentro de aspas (exports da TMB não têm — D-R11).
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

function montarLinha(
  registro: Record<string, string>,
  numeroLinha: number,
): ResultadoParseTmb {
  const fonte = 'tmb.csv' as const;
  const erros: string[] = [];
  const g = (k: string): string | undefined => textoOuUndefined(registro[k]);

  const idOrigem = g('pedido_id') ?? g('pedido');
  if (!idOrigem) {
    return {
      tipoOrigem: fonte,
      payloadBruto: registro,
      erros: [`linha ${numeroLinha}: sem identificador de pedido`],
    };
  }

  const bruto = dinheiroDeValorTmb(
    registro.valor_principal ?? registro.valor_total,
    erros,
    `linha ${numeroLinha} valor_principal`,
  );
  const taxas = dinheiroDeValorTmb(
    registro.taxa_administracao,
    erros,
    `linha ${numeroLinha} taxa_administracao`,
  );

  return montarResultado(
    fonte,
    registro,
    {
      idOrigem,
      statusOrigem: g('status_pedido') ?? '',
      ocorridoEm: g('data_efetivado') ?? g('criado_em') ?? '',
      comprador: {
        nome: g('cliente'),
        emails: g('email') ? [String(registro.email).trim()] : undefined,
        telefones: telefonesDeString(registro.telefones, registro.telefone),
        documentos: soDigitos(registro.documento) ? [soDigitos(registro.documento)] : undefined,
        endereco: enderecoDeTmb({
          logradouro: registro.endereco_logradouro,
          numero: registro.endereco_numero,
          complemento: registro.endereco_complemento,
          bairro: registro.endereco_bairro,
          cidade: registro.endereco_cidade,
          uf: registro.endereco_estado,
          cep: registro.endereco_cep ?? registro.cep,
          pais: registro.endereco_pais ?? registro.pais,
        }),
      },
      valores: { bruto, taxas, liquido: liquidoDe(bruto, taxas) },
      oferta: { nomeOrigem: g('titulo') ?? g('lancamento') },
    },
    erros,
  );
}

/**
 * Adapter TMB — **CSV** (spec 019). Detecta separador `,`/`;`, tira BOM, respeita
 * aspas. 1 `ResultadoParseTmb` por linha de dado. Linha sem identificador de
 * pedido → erro (não aborta o lote). Sem coluna de pedido no cabeçalho → toda
 * linha vira erro. Nunca lança.
 */
export function parseCsv(conteudo: string): ResultadoParseTmb[] {
  const texto = conteudo.replace(/^\uFEFF/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return [];

  const sep = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], sep).map((h) => h.toLowerCase());

  return linhas.slice(1).map((linha, idx) => {
    const valores = dividirLinha(linha, sep);
    const registro: Record<string, string> = {};
    cabecalho.forEach((col, i) => {
      registro[col] = valores[i] ?? '';
    });
    return montarLinha(registro, idx + 2);
  });
}
