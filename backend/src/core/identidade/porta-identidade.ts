/**
 * `PortaIdentidade` (spec 008) — contrato de **inversão de dependência** para a
 * engine de identidade/dedup da spec 005 (`ResolverOuCriarService`).
 *
 * O `core` é `@Global()` e é a única exceção declarada à fronteira entre
 * contextos (Princípio VI). Publicar aqui **só a interface + o token DI** permite
 * que o `crm` (spec 008, conversão Lead → Pessoa) e depois o `financeiro`
 * (spec 018, etapa "resolver pessoa" do pipeline) consumam a engine **sem
 * importar `src/clientes/**`** — o que a regra ESLint `import/no-restricted-paths`
 * proíbe.
 *
 * A implementação (adaptador) vive em `src/clientes/` e é registrada por um
 * módulo `@Global()` (`IdentidadeWiringModule`). Zero lógica aqui.
 */

/** Dados brutos de identidade; a engine normaliza (e-mail, telefone E.164, doc + DV). */
export interface DadosIdentidadeLead {
  nome?: string | null;
  /** CPF ou CNPJ bruto — classificado por nº de dígitos + DV pela engine da 005. */
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
}

/** Rastro de origem que a engine anexa como `pessoa_origem_ref`. */
export interface OrigemIdentidade {
  plataformaOrigem: string;
  refs: { tipoRef: string; valorRef: string }[];
}

export interface OpcoesPortaIdentidade {
  /** `false` = nunca cria pessoa (venda de afiliada). Na conversão de lead é sempre `true`. */
  criar: boolean;
  origem: OrigemIdentidade;
}

export interface ResultadoPortaIdentidade {
  /** `null` só quando `criar: false` e nada casou. */
  pessoaId: string | null;
  criada: boolean;
}

export interface PortaIdentidade {
  resolverOuCriar(
    dados: DadosIdentidadeLead,
    opts: OpcoesPortaIdentidade,
  ): Promise<ResultadoPortaIdentidade>;
}

/** Token DI. `@Inject(PORTA_IDENTIDADE)` no consumidor; provido pelo wiring da 005. */
export const PORTA_IDENTIDADE = Symbol('PORTA_IDENTIDADE');
