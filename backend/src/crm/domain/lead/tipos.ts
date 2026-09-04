/**
 * Tipos do domínio `lead` (spec 008). Puros — nenhum import de infra/Prisma.
 * Os enums são os mesmos do client Prisma (mesma fonte, sem duplicar valores).
 */
import { LeadEstagio, LeadStatus, CampoPersonalizadoTipo } from '@prisma/client';

export { LeadEstagio, LeadStatus, CampoPersonalizadoTipo };

export const LEAD_ESTAGIOS = [
  'NOVO',
  'CONTATO_FEITO',
  'QUALIFICADO',
  'NUTRICAO',
  'DESQUALIFICADO',
] as const satisfies readonly LeadEstagio[];

export const LEAD_STATUS = [
  'ATIVO',
  'DESCARTADO',
  'CONVERTIDO',
] as const satisfies readonly LeadStatus[];

export const CAMPO_TIPOS = [
  'TEXTO',
  'NUMERO',
  'BOOLEANO',
  'DATA',
  'SELECAO',
] as const satisfies readonly CampoPersonalizadoTipo[];

/** Entrada da função pura `calcularScore` — materializada pelo serviço (data-model.md). */
export interface EstadoScoreLead {
  temEmail: boolean;
  temTelefone: boolean;
  temDocumento: boolean;
  /** Qualquer `utm_*` não-vazio. */
  temUtm: boolean;
  origem: string | null;
  estagio: LeadEstagio;
  /** ISO 8601 — a "idade em dias" é derivada com `agoraUtc()`. */
  criadoEm: string;
  /** 0 nesta spec — `interacao` é a spec 009. */
  qtdInteracoes: number;
  ultimaInteracaoEm: string | null;
  qtdTags: number;
}

/** Resultado de `POST /crm/leads/:id/converter`. */
export interface ResultadoConversao {
  leadId: string;
  pessoaId: string;
  criouPessoa: boolean;
  status: 'CONVERTIDO';
}

/** Campos aceitos tanto pelo `POST /crm/leads` quanto pela porta `RegistrarLeadService`. */
export interface CriarLeadEntrada {
  nome: string;
  email?: string | null;
  telefone?: string | null;
  documento?: string | null;
  origem?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  estagio?: LeadEstagio;
  responsavelId?: string | null;
  tags?: string[];
}

/** Chave de idempotência da porta de integração (índice único parcial). */
export interface ChaveOrigemLead {
  origem: string;
  idExterno: string;
}

/** Motivos canônicos de uma linha de `crm_lead_audit`. */
export type MotivoAuditoriaLead =
  | 'criar'
  | 'editar'
  | 'tag'
  | 'estagio'
  | 'status'
  | 'responsavel'
  | 'recalculo'
  | 'converter'
  | 'campos_personalizados'
  | 'registrar_integracao';

/** Entrada de auditoria de lead — forma canônica do core (`AJUSTE_MANUAL`). */
export interface EntradaAuditoriaLead {
  autor: string;
  entidade: 'lead' | 'valor_campo_lead';
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: MotivoAuditoriaLead;
}

