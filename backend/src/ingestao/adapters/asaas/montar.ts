import {
  eventoCanonicoSchema,
  PlataformaOrigem,
  type EventoCanonico,
} from '../../../core/core.module';
import type { DinheiroCanonicoAsaas } from './normalizar-asaas';
import type { ContaAsaas, FonteAsaas, ResultadoParseAsaas } from './tipos';

/** Campos já extraídos/normalizados de uma das fontes da Asaas. */
export interface CamposCanonicosAsaas {
  idOrigem?: string;
  statusOrigem?: string;
  ocorridoEm?: string;
  comprador?: {
    nome?: string;
    emails?: string[];
    telefones?: string[];
    documentos?: string[];
  };
  valores?: {
    bruto?: DinheiroCanonicoAsaas;
    liquido?: DinheiroCanonicoAsaas;
    taxas?: DinheiroCanonicoAsaas;
    reembolso?: DinheiroCanonicoAsaas;
  };
  /** `externalReference` cru — ponte para a Guru (A-02). Nunca com `plataforma`. */
  referenciaExternaIdOrigem?: string;
  assinaturaRecorrencia?: boolean;
  oferta?: { nomeOrigem?: string };
}

function limparComprador(
  c: CamposCanonicosAsaas['comprador'],
): CamposCanonicosAsaas['comprador'] | undefined {
  if (!c) return undefined;
  const out: NonNullable<CamposCanonicosAsaas['comprador']> = {};
  if (c.nome) out.nome = c.nome;
  if (c.emails && c.emails.length) out.emails = c.emails;
  if (c.telefones && c.telefones.length) out.telefones = c.telefones;
  if (c.documentos && c.documentos.length) out.documentos = c.documentos;
  return Object.keys(out).length ? out : undefined;
}

function limparValores(
  v: CamposCanonicosAsaas['valores'],
): CamposCanonicosAsaas['valores'] | undefined {
  if (!v) return undefined;
  const out: NonNullable<CamposCanonicosAsaas['valores']> = {};
  if (v.bruto) out.bruto = v.bruto;
  if (v.liquido) out.liquido = v.liquido;
  if (v.taxas) out.taxas = v.taxas;
  if (v.reembolso) out.reembolso = v.reembolso;
  return Object.keys(out).length ? out : undefined;
}

const CONTA_PRISMA: Record<ContaAsaas, PlataformaOrigem> = {
  ASAAS_PRD: PlataformaOrigem.ASAAS_PRD,
  ASAAS_SVC: PlataformaOrigem.ASAAS_SVC,
};

/**
 * Monta o `EventoCanonico` de um fato da Asaas e o **valida** com o schema do
 * `core` (a validação `.strict()` cai só sobre a **saída** do parser — o payload
 * cru pode ter quantas chaves a mais quiser). Nunca lança: schema inválido →
 * `eventoCanonico` ausente + `erros`. `conta` (`ASAAS_PRD`/`ASAAS_SVC`) vem do
 * path do webhook / do DTO — o payload nunca a determina (A-05/FR-007).
 */
export function montarResultado(
  conta: ContaAsaas,
  fonte: FonteAsaas,
  payloadBruto: unknown,
  campos: CamposCanonicosAsaas,
  erros: string[],
): ResultadoParseAsaas {
  const idOrigem = campos.idOrigem;
  if (!idOrigem) {
    return {
      tipoOrigem: fonte,
      payloadBruto,
      erros: [...erros, 'sem identificador de cobrança'],
    };
  }

  const comprador = limparComprador(campos.comprador);
  const valores = limparValores(campos.valores);
  const oferta = campos.oferta && campos.oferta.nomeOrigem ? campos.oferta : undefined;
  const referenciaExterna = campos.referenciaExternaIdOrigem
    ? { idOrigem: campos.referenciaExternaIdOrigem }
    : undefined;
  const assinatura = campos.assinaturaRecorrencia ? { ehRecorrencia: true } : undefined;

  const candidato = {
    plataformaOrigem: CONTA_PRISMA[conta],
    idOrigem,
    tipoOrigem: fonte,
    statusOrigem: campos.statusOrigem ?? '',
    ocorridoEm: campos.ocorridoEm ?? '',
    ...(comprador ? { comprador } : {}),
    ...(valores ? { valores } : {}),
    ...(oferta ? { oferta } : {}),
    ...(referenciaExterna ? { referenciaExterna } : {}),
    ...(assinatura ? { assinatura } : {}),
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
