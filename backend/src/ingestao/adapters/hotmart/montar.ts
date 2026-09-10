import {
  eventoCanonicoSchema,
  PlataformaOrigem,
  type EventoCanonico,
} from '../../../core/core.module';
import type {
  DinheiroCanonicoHotmart,
  EnderecoHotmart,
} from './normalizar-hotmart';
import type { ContaHotmart, FonteHotmart, ResultadoParseHotmart } from './tipos';

/** Campos já extraídos/normalizados de uma das fontes da Hotmart. */
export interface CamposCanonicosHotmart {
  idOrigem?: string;
  statusOrigem?: string;
  ocorridoEm?: string;
  comprador?: {
    nome?: string;
    emails?: string[];
    telefones?: string[];
    documentos?: string[];
    endereco?: EnderecoHotmart;
  };
  valores?: {
    bruto?: DinheiroCanonicoHotmart;
    liquido?: DinheiroCanonicoHotmart;
    taxas?: DinheiroCanonicoHotmart;
    reembolso?: DinheiroCanonicoHotmart;
  };
  oferta?: { nomeOrigem?: string; codigoOrigem?: string; quantidade?: number };
  assinaturaRecorrencia?: boolean;
  numeroCiclo?: number;
  ehAfiliada?: boolean;
}

function limparComprador(
  c: CamposCanonicosHotmart['comprador'],
): CamposCanonicosHotmart['comprador'] | undefined {
  if (!c) return undefined;
  const out: NonNullable<CamposCanonicosHotmart['comprador']> = {};
  if (c.nome) out.nome = c.nome;
  if (c.emails && c.emails.length) out.emails = c.emails;
  if (c.telefones && c.telefones.length) out.telefones = c.telefones;
  if (c.documentos && c.documentos.length) out.documentos = c.documentos;
  if (c.endereco) out.endereco = c.endereco;
  return Object.keys(out).length ? out : undefined;
}

function limparValores(
  v: CamposCanonicosHotmart['valores'],
): CamposCanonicosHotmart['valores'] | undefined {
  if (!v) return undefined;
  const out: NonNullable<CamposCanonicosHotmart['valores']> = {};
  if (v.bruto) out.bruto = v.bruto;
  if (v.liquido) out.liquido = v.liquido;
  if (v.taxas) out.taxas = v.taxas;
  if (v.reembolso) out.reembolso = v.reembolso;
  return Object.keys(out).length ? out : undefined;
}

function limparOferta(
  o: CamposCanonicosHotmart['oferta'],
): CamposCanonicosHotmart['oferta'] | undefined {
  if (!o) return undefined;
  const out: NonNullable<CamposCanonicosHotmart['oferta']> = {};
  if (o.codigoOrigem) out.codigoOrigem = o.codigoOrigem;
  if (o.nomeOrigem) out.nomeOrigem = o.nomeOrigem;
  if (o.quantidade) out.quantidade = o.quantidade;
  return out.codigoOrigem || out.nomeOrigem ? out : undefined;
}

const CONTA_PRISMA: Record<ContaHotmart, PlataformaOrigem> = {
  HOTMART_PRD: PlataformaOrigem.HOTMART_PRD,
  HOTMART_SVC: PlataformaOrigem.HOTMART_SVC,
};

/**
 * Monta o `EventoCanonico` de um fato da Hotmart e o **valida** com o schema do
 * `core` (a validação `.strict()` cai só sobre a **saída** do parser — o payload
 * cru pode ter quantas chaves a mais quiser). Nunca lança: schema inválido →
 * `eventoCanonico` ausente + `erros`. `conta` (`HOTMART_PRD`/`HOTMART_SVC`) vem do
 * path do webhook / do DTO — o payload nunca a determina (H-07/FR-007).
 *
 * A Hotmart **não terceiriza cobrança** (diferente da Guru→Asaas) — o adapter
 * **nunca** emite `referenciaExterna`.
 */
export function montarResultado(
  conta: ContaHotmart,
  fonte: FonteHotmart,
  payloadBruto: unknown,
  campos: CamposCanonicosHotmart,
  erros: string[],
): ResultadoParseHotmart {
  const idOrigem = campos.idOrigem;
  if (!idOrigem) {
    return {
      tipoOrigem: fonte,
      payloadBruto,
      erros: [...erros, 'sem identificador de transação'],
    };
  }

  const comprador = limparComprador(campos.comprador);
  const valores = limparValores(campos.valores);
  const oferta = limparOferta(campos.oferta);
  const assinatura = campos.assinaturaRecorrencia
    ? {
        ehRecorrencia: true,
        ...(campos.numeroCiclo ? { numeroCiclo: campos.numeroCiclo } : {}),
      }
    : undefined;

  const candidato = {
    plataformaOrigem: CONTA_PRISMA[conta],
    idOrigem,
    tipoOrigem: fonte,
    statusOrigem: campos.statusOrigem ?? '',
    ocorridoEm: campos.ocorridoEm ?? '',
    ...(comprador ? { comprador } : {}),
    ...(valores ? { valores } : {}),
    ...(oferta ? { oferta } : {}),
    ...(assinatura ? { assinatura } : {}),
    ...(campos.ehAfiliada ? { ehAfiliada: true } : {}),
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
