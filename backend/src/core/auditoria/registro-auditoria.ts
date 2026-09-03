import { agoraUtc } from '../tempo/agora';

/**
 * Origem de uma mudança registrada. **Enum fechado** (decisão do dono do produto,
 * spec 002 §Clarifications): valores novos exigem mudança deliberada aqui, como
 * `PlataformaOrigem` e os enums de status.
 */
export enum OrigemMudanca {
  CURADORIA = 'CURADORIA',
  AJUSTE_MANUAL = 'AJUSTE_MANUAL',
  MIGRACAO = 'MIGRACAO',
}

const ORIGENS = new Set<string>(Object.values(OrigemMudanca));

/**
 * Forma canônica de um registro de mudança curada / ajuste manual (Padrão
 * Transversal "Auditoria"). Esta spec entrega só a forma e o normalizador —
 * **sem tabela**. As tabelas `_audit` são de cada spec dona; o painel
 * consolidado é a spec 053, que consome este formato sem redefini-lo.
 */
export interface RegistroAuditoria {
  autor: string;
  quando: Date;
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
  origem: OrigemMudanca;
}

/**
 * Produz um `RegistroAuditoria` normalizado. Função pura, testável sem banco.
 *
 * - `quando` ausente → `agoraUtc()`.
 * - `motivo` vazio / só espaços → `TypeError`.
 * - `origem` fora do enum → `TypeError`.
 */
export function montarRegistroAuditoria(
  dados: Omit<RegistroAuditoria, 'quando'> & { quando?: Date },
): RegistroAuditoria {
  if (typeof dados.motivo !== 'string' || dados.motivo.trim() === '') {
    throw new TypeError('montarRegistroAuditoria: motivo é obrigatório e não pode ser vazio');
  }
  if (!ORIGENS.has(dados.origem)) {
    throw new TypeError(
      `montarRegistroAuditoria: origem inválida: ${JSON.stringify(dados.origem)}`,
    );
  }
  return {
    autor: dados.autor,
    quando: dados.quando ?? agoraUtc(),
    entidade: dados.entidade,
    entidadeId: dados.entidadeId,
    campo: dados.campo,
    valorAnterior: dados.valorAnterior,
    valorNovo: dados.valorNovo,
    motivo: dados.motivo,
    origem: dados.origem,
  };
}
