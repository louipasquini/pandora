import {
  eventoCanonicoSchema,
  PlataformaOrigem,
  type EventoCanonico,
} from '../../../core/core.module';
import type { DinheiroCanonicoGuru, EnderecoGuru } from './normalizar-guru';
import type { ContaGuru, FonteGuru, ResultadoParseGuru } from './tipos';

/** Campos já extraídos/normalizados de uma das fontes da Guru. */
export interface CamposCanonicosGuru {
  idOrigem?: string;
  statusOrigem?: string;
  ocorridoEm?: string;
  comprador?: {
    nome?: string;
    emails?: string[];
    telefones?: string[];
    documentos?: string[];
    endereco?: EnderecoGuru;
  };
  valores?: {
    bruto?: DinheiroCanonicoGuru;
    liquido?: DinheiroCanonicoGuru;
    taxas?: DinheiroCanonicoGuru;
    reembolso?: DinheiroCanonicoGuru;
  };
  oferta?: { nomeOrigem?: string; codigoOrigem?: string; quantidade?: number };
  assinaturaRecorrencia?: boolean;
  numeroCiclo?: number;
  ehAfiliada?: boolean;
}

function limparComprador(
  c: CamposCanonicosGuru['comprador'],
): CamposCanonicosGuru['comprador'] | undefined {
  if (!c) return undefined;
  const out: NonNullable<CamposCanonicosGuru['comprador']> = {};
  if (c.nome) out.nome = c.nome;
  if (c.emails && c.emails.length) out.emails = c.emails;
  if (c.telefones && c.telefones.length) out.telefones = c.telefones;
  if (c.documentos && c.documentos.length) out.documentos = c.documentos;
  if (c.endereco) out.endereco = c.endereco;
  return Object.keys(out).length ? out : undefined;
}

function limparValores(
  v: CamposCanonicosGuru['valores'],
): CamposCanonicosGuru['valores'] | undefined {
  if (!v) return undefined;
  const out: NonNullable<CamposCanonicosGuru['valores']> = {};
  if (v.bruto) out.bruto = v.bruto;
  if (v.liquido) out.liquido = v.liquido;
  if (v.taxas) out.taxas = v.taxas;
  if (v.reembolso) out.reembolso = v.reembolso;
  return Object.keys(out).length ? out : undefined;
}

function limparOferta(
  o: CamposCanonicosGuru['oferta'],
): CamposCanonicosGuru['oferta'] | undefined {
  if (!o) return undefined;
  const out: NonNullable<CamposCanonicosGuru['oferta']> = {};
  if (o.codigoOrigem) out.codigoOrigem = o.codigoOrigem;
  if (o.nomeOrigem) out.nomeOrigem = o.nomeOrigem;
  if (o.quantidade) out.quantidade = o.quantidade;
  return out.codigoOrigem || out.nomeOrigem ? out : undefined;
}

const CONTA_PRISMA: Record<ContaGuru, PlataformaOrigem> = {
  GURU_PRD: PlataformaOrigem.GURU_PRD,
  GURU_SVC: PlataformaOrigem.GURU_SVC,
};

/**
 * Monta o `EventoCanonico` de um fato da Guru e o **valida** com o schema do
 * `core` (a validação `.strict()` cai só sobre a **saída** do parser — o payload
 * cru pode ter quantas chaves a mais quiser). Nunca lança: schema inválido →
 * `eventoCanonico` ausente + `erros`. `conta` (`GURU_PRD`/`GURU_SVC`) vem do path
 * do webhook / do DTO — o payload nunca a determina (G-07/FR-007).
 *
 * A Guru **é a venda de registro** (Regra Inviolável nº 2) — o adapter **nunca**
 * emite `referenciaExterna`; o vínculo Asaas↔Guru é da spec 024.
 */
export function montarResultado(
  conta: ContaGuru,
  fonte: FonteGuru,
  payloadBruto: unknown,
  campos: CamposCanonicosGuru,
  erros: string[],
): ResultadoParseGuru {
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
