/**
 * Tipos do domínio `workflow` (spec 014). Puros — nenhum import de infra/Prisma
 * além dos enums do client (mesma fonte, sem duplicar valores).
 */
import { z } from 'zod';
import { FluxoGatilhoTipo, FluxoRegistroTipo } from '@prisma/client';
import { LEAD_ESTAGIOS } from '../lead/tipos';

export { FluxoGatilhoTipo, FluxoRegistroTipo };

export const FLUXO_GATILHO_TIPOS = [
  'LEAD_CRIADO',
  'LEAD_ESTAGIO_MUDOU',
  'OPORTUNIDADE_ETAPA_MUDOU',
  'INTERACAO_REGISTRADA',
  'TAG_APLICADA',
  'EVENTO_EXTERNO',
] as const satisfies readonly FluxoGatilhoTipo[];

/** Gatilhos internos, reagidos pelo worker (D-02). `EVENTO_EXTERNO` fica de fora (CL-01). */
export const FLUXO_GATILHO_TIPOS_INTERNOS = FLUXO_GATILHO_TIPOS.filter(
  (t) => t !== 'EVENTO_EXTERNO',
) as readonly Exclude<FluxoGatilhoTipo, 'EVENTO_EXTERNO'>[];

/**
 * A qual tipo de registro cada gatilho resolve (D-R4 do research.md) — sempre
 * `LEAD` ou `OPORTUNIDADE`, nunca `PESSOA` nesta versão. `EVENTO_EXTERNO` não
 * resolve nada (nunca executa, CL-01).
 */
export function registroTipoDoGatilho(tipo: FluxoGatilhoTipo): FluxoRegistroTipo | null {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return 'OPORTUNIDADE';
  if (tipo === 'EVENTO_EXTERNO') return null;
  return 'LEAD';
}

// --- Condições (árvore E/OU) -----------------------------------------------

export const OPERADORES_CONDICAO = [
  'igual',
  'diferente',
  'contem',
  'nao_contem',
  'definido',
  'nao_definido',
  'maior_que',
  'menor_que',
] as const;
export type OperadorCondicao = (typeof OPERADORES_CONDICAO)[number];

export interface CondicaoFolha {
  tipo: 'folha';
  campo: string;
  operador: OperadorCondicao;
  valor?: string | number | boolean;
}

export interface CondicaoGrupo {
  tipo: 'grupo';
  operador: 'E' | 'OU';
  itens: CondicaoNo[];
}

export type CondicaoNo = CondicaoFolha | CondicaoGrupo;

export function condicaoVaziaPadrao(): CondicaoGrupo {
  return { tipo: 'grupo', operador: 'E', itens: [] };
}

const condicaoFolhaSchema: z.ZodType<CondicaoFolha> = z.object({
  tipo: z.literal('folha'),
  campo: z.string().min(1),
  operador: z.enum(OPERADORES_CONDICAO),
  valor: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const condicaoNoSchema: z.ZodType<CondicaoNo> = z.lazy(() =>
  z.union([
    condicaoFolhaSchema,
    z.object({
      tipo: z.literal('grupo'),
      operador: z.enum(['E', 'OU']),
      itens: z.array(condicaoNoSchema),
    }),
  ]),
);

// --- Ações (catálogo fechado, D-04 em spec.md) ------------------------------

export const ACAO_TIPOS = [
  'MOVER_LEAD_ESTAGIO',
  'APLICAR_TAG',
  'REMOVER_TAG',
  'REGISTRAR_NOTA',
  'MOVER_OPORTUNIDADE_ETAPA',
] as const;
export type AcaoTipo = (typeof ACAO_TIPOS)[number];

export interface AcaoMoverLeadEstagio {
  tipo: 'MOVER_LEAD_ESTAGIO';
  estagioDestino: (typeof LEAD_ESTAGIOS)[number];
}
export interface AcaoAplicarTag {
  tipo: 'APLICAR_TAG';
  tag: string;
}
export interface AcaoRemoverTag {
  tipo: 'REMOVER_TAG';
  tag: string;
}
export interface AcaoRegistrarNota {
  tipo: 'REGISTRAR_NOTA';
  conteudo: string;
}
export interface AcaoMoverOportunidadeEtapa {
  tipo: 'MOVER_OPORTUNIDADE_ETAPA';
  etapaDestinoId: string;
  motivo?: string;
}

export type AcaoFluxo =
  | AcaoMoverLeadEstagio
  | AcaoAplicarTag
  | AcaoRemoverTag
  | AcaoRegistrarNota
  | AcaoMoverOportunidadeEtapa;

export const acaoFluxoSchema: z.ZodType<AcaoFluxo> = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('MOVER_LEAD_ESTAGIO'), estagioDestino: z.enum(LEAD_ESTAGIOS) }),
  z.object({ tipo: z.literal('APLICAR_TAG'), tag: z.string().min(1) }),
  z.object({ tipo: z.literal('REMOVER_TAG'), tag: z.string().min(1) }),
  z.object({ tipo: z.literal('REGISTRAR_NOTA'), conteudo: z.string().min(1) }),
  z.object({
    tipo: z.literal('MOVER_OPORTUNIDADE_ETAPA'),
    etapaDestinoId: z.string().uuid(),
    motivo: z.string().min(1).optional(),
  }),
]);

export const acoesFluxoSchema = z.array(acaoFluxoSchema);

/** Resultado de uma ação individual, gravado em `execucao_fluxo.acoes_aplicadas`. */
export interface AcaoAplicadaResultado {
  tipo: AcaoTipo;
  status: 'aplicada' | 'falhou';
  detalhe?: string;
}
