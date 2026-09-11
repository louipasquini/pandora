/**
 * Schema de colunas de um CSV de catálogo — validado **por completo** contra o
 * cabeçalho antes de processar qualquer linha (spec 023, D-12 / Parte 7 #3 da
 * visão: "catálogo completo... validado por schema antes de processar").
 */
export interface ColunaSchema {
  /** nome canônico usado pelo parser (`g('codigo')`, etc.). */
  canonica: string;
  /** aliases aceitos no cabeçalho, em minúsculas. */
  aliases: string[];
  obrigatoria: boolean;
}

export interface ResultadoValidacaoSchema {
  ok: boolean;
  /** posição de cada coluna canônica encontrada no cabeçalho. */
  indice: Record<string, number>;
  /** nomes canônicos obrigatórios que não foram encontrados. */
  colunasFaltando: string[];
}

/**
 * Casa cada coluna do schema contra o cabeçalho (por alias, case-insensitive —
 * o `cabecalho` já chega em minúsculas de `lerCsv`). `ok: false` se qualquer
 * coluna **obrigatória** não for encontrada — o chamador deve rejeitar o
 * arquivo inteiro (0 linha processada) nesse caso.
 */
export function validarSchemaColunas(
  cabecalho: readonly string[],
  schema: readonly ColunaSchema[],
): ResultadoValidacaoSchema {
  const indice: Record<string, number> = {};
  const colunasFaltando: string[] = [];

  for (const coluna of schema) {
    const pos = cabecalho.findIndex((h) => coluna.aliases.includes(h));
    if (pos >= 0) {
      indice[coluna.canonica] = pos;
    } else if (coluna.obrigatoria) {
      colunasFaltando.push(coluna.canonica);
    }
  }

  return { ok: colunasFaltando.length === 0, indice, colunasFaltando };
}

/** Helper de leitura de campo por nome canônico — `undefined` se ausente/vazio. */
export function leitorDeCampos(
  valores: readonly string[],
  indice: Record<string, number>,
): (canonica: string) => string | undefined {
  return (canonica: string) => {
    const pos = indice[canonica];
    if (pos === undefined) return undefined;
    const v = valores[pos]?.trim();
    return v ? v : undefined;
  };
}
