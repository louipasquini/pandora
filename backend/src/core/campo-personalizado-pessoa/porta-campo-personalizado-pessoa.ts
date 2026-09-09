/**
 * `PortaCampoPersonalizadoPessoa` (spec 013) — contrato de **inversão de
 * dependência** para que o `crm` (aceitar uma sugestão de campo
 * personalizado de IA, spec 013) grave um valor em `pessoa` sem importar
 * `src/clientes/**` (Princípio VI) — mesmo padrão de `PortaIdentidade`
 * (spec 008, `./identidade/porta-identidade.ts`).
 *
 * A implementação (adaptador) vive em `src/clientes/` e é registrada pelo
 * módulo `@Global()` `ClientesWiringModule` (renomeado de
 * `IdentidadeWiringModule` nesta spec). Zero lógica aqui.
 */

export interface DefinicaoCampoPersonalizadoPessoa {
  id: string;
  chave: string;
  rotulo: string;
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'DATA' | 'SELECAO';
  opcoes: string[];
  ativo: boolean;
}

export interface PortaCampoPersonalizadoPessoa {
  listarDefinicoesAtivas(): Promise<DefinicaoCampoPersonalizadoPessoa[]>;
  /** Grava **1** valor sem tocar nos demais campos da pessoa. */
  definirValor(
    pessoaId: string,
    definicaoId: string,
    valor: string,
    autor: string,
  ): Promise<void>;
}

/** Token DI. `@Inject(PORTA_CAMPO_PERSONALIZADO_PESSOA)` no consumidor. */
export const PORTA_CAMPO_PERSONALIZADO_PESSOA = Symbol('PORTA_CAMPO_PERSONALIZADO_PESSOA');
