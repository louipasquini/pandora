/**
 * Tipos de apoio do contexto `crm` (spec 007). Puros — sem NestJS, sem Prisma
 * client em runtime (só `import type`).
 */
export {
  EquipeTipo,
  PapelEquipe,
  IntegracaoTipo,
  IntegracaoAlvo,
} from '@prisma/client';

/** 0 = domingo … 6 = sábado (alinhado a `Date.getUTCDay()` e ao `Intl` weekday). */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Janela já materializada para a avaliação de expediente (minutos locais). */
export interface JanelaAplic {
  equipeId: string | null;
  diaSemana: number;
  inicioMin: number;
  fimMin: number;
  ativo: boolean;
}

/** Feriado já materializado — `mes` 1–12, `dia` 1–31, `ano` só se não recorrente. */
export interface FeriadoAplic {
  equipeId: string | null;
  mes: number;
  dia: number;
  ano: number | null;
  recorrenteAnual: boolean;
}

export interface OpcoesExpediente {
  janelas: JanelaAplic[];
  feriados: FeriadoAplic[];
  equipe?: { id: string; ativo: boolean } | null;
}

export interface ResultadoExpediente {
  emExpediente: boolean;
  instante: string;
  equipeId: string | null;
}

/** Entrada de auditoria administrativa — nunca carrega valor de segredo. */
export interface EntradaAuditoriaCrm {
  autor: string;
  entidade:
    | 'equipe'
    | 'equipe_membro'
    | 'janela_atendimento'
    | 'feriado'
    | 'integracao'
    // spec 008 — definições de campo personalizado de lead são config administrativa
    | 'campo_personalizado_lead';
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}
