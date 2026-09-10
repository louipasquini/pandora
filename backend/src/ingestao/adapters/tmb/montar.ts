import {
  eventoCanonicoSchema,
  PlataformaOrigem,
  type EventoCanonico,
} from '../../../core/core.module';
import type { DinheiroCanonicoTmb, EnderecoTmb } from './normalizar-tmb';
import type { FonteTmb, ResultadoParseTmb } from './tipos';

/** Campos já extraídos/normalizados de uma das fontes da TMB. */
export interface CamposCanonicosTmb {
  idOrigem?: string;
  statusOrigem?: string;
  ocorridoEm?: string;
  comprador?: {
    nome?: string;
    emails?: string[];
    telefones?: string[];
    documentos?: string[];
    endereco?: EnderecoTmb;
  };
  valores?: {
    bruto?: DinheiroCanonicoTmb;
    liquido?: DinheiroCanonicoTmb;
    taxas?: DinheiroCanonicoTmb;
    reembolso?: DinheiroCanonicoTmb;
  };
  oferta?: { nomeOrigem?: string; codigoOrigem?: string; quantidade?: number };
}

function limparComprador(
  c: CamposCanonicosTmb['comprador'],
): CamposCanonicosTmb['comprador'] | undefined {
  if (!c) return undefined;
  const out: NonNullable<CamposCanonicosTmb['comprador']> = {};
  if (c.nome) out.nome = c.nome;
  if (c.emails && c.emails.length) out.emails = c.emails;
  if (c.telefones && c.telefones.length) out.telefones = c.telefones;
  if (c.documentos && c.documentos.length) out.documentos = c.documentos;
  if (c.endereco) out.endereco = c.endereco;
  return Object.keys(out).length ? out : undefined;
}

function limparValores(
  v: CamposCanonicosTmb['valores'],
): CamposCanonicosTmb['valores'] | undefined {
  if (!v) return undefined;
  const out: NonNullable<CamposCanonicosTmb['valores']> = {};
  if (v.bruto) out.bruto = v.bruto;
  if (v.liquido) out.liquido = v.liquido;
  if (v.taxas) out.taxas = v.taxas;
  if (v.reembolso) out.reembolso = v.reembolso;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Monta o `EventoCanonico` de um fato da TMB e o **valida** com o schema do
 * `core` (a validação `.strict()` cai só sobre a **saída** do parser — o payload
 * cru pode ter quantas chaves a mais quiser, a doc da TMB pede que a gente não
 * quebre por isso). Nunca lança: schema inválido → `eventoCanonico` ausente +
 * `erros`.
 */
export function montarResultado(
  fonte: FonteTmb,
  payloadBruto: unknown,
  campos: CamposCanonicosTmb,
  erros: string[],
): ResultadoParseTmb {
  const idOrigem = campos.idOrigem;
  if (!idOrigem) {
    return { tipoOrigem: fonte, payloadBruto, erros: [...erros, 'sem identificador de pedido'] };
  }

  const comprador = limparComprador(campos.comprador);
  const valores = limparValores(campos.valores);
  const oferta =
    campos.oferta && (campos.oferta.nomeOrigem || campos.oferta.codigoOrigem)
      ? campos.oferta
      : undefined;

  const candidato = {
    plataformaOrigem: PlataformaOrigem.TMB,
    idOrigem,
    tipoOrigem: fonte,
    statusOrigem: campos.statusOrigem ?? '',
    ocorridoEm: campos.ocorridoEm ?? '',
    ...(comprador ? { comprador } : {}),
    ...(valores ? { valores } : {}),
    ...(oferta ? { oferta } : {}),
  };

  const parsed = eventoCanonicoSchema.safeParse(candidato);
  if (!parsed.success) {
    return {
      tipoOrigem: fonte,
      idOrigem,
      payloadBruto,
      erros: [
        ...erros,
        ...parsed.error.issues.map((i) => `schema ${i.path.join('.')}: ${i.message}`),
      ],
    };
  }

  return {
    tipoOrigem: fonte,
    idOrigem,
    payloadBruto,
    eventoCanonico: parsed.data as EventoCanonico,
    erros,
  };
}
