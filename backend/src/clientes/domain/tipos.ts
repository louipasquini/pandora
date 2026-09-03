/**
 * Tipos do domínio `clientes` (spec 005). Puros — nenhum import de infra/Prisma.
 */

/** Critério de dedup, na ordem de prioridade (regra de negócio inviolável #10). */
export type Criterio = 'documento' | 'cnpj' | 'email' | 'telefone';

/** Rótulo ordinal de confiança da resolução (não é score numérico — research D8). */
export type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA';

/** Confiança por critério que resolveu. */
export const CONFIANCA_POR_CRITERIO: Record<Criterio, Confianca> = {
  documento: 'ALTA',
  cnpj: 'ALTA',
  email: 'MEDIA',
  telefone: 'BAIXA',
};

/** Dados de identidade que o chamador passa para a engine. Brutos — a engine normaliza. */
export interface DadosIdentidade {
  nome?: string | null;
  /** CPF ou CNPJ bruto; classificado por nº de dígitos + DV. */
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
}

/**
 * Uma `pessoa` candidata, já com as chaves **normalizadas** por quem carregou do
 * banco. `mergedPara` aponta a sobrevivente (a engine resolve a cadeia).
 */
export interface PessoaCandidata {
  id: string;
  documentos: string[];
  cnpjs: string[];
  emails: string[];
  telefones: string[];
  mergedPara: string | null;
}

/** Candidato devolvido para revisão / merge humano. */
export interface CandidatoResultado {
  id: string;
  criterios: Criterio[];
}

/** Resultado de `resolverIdentidade`. */
export interface ResultadoIdentidade {
  pessoaId: string | null;
  criterio: Criterio | null;
  confianca: Confianca | null;
  candidatos: CandidatoResultado[];
}

/** Resultado de `resolverOuCriar` (serviço). */
export interface ResultadoResolverOuCriar {
  pessoaId: string | null;
  criada: boolean;
  candidatos: CandidatoResultado[];
  /** nº de `nota_reconciliacao` gravadas nesta chamada. */
  notas: number;
}
