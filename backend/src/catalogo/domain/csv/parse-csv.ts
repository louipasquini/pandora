/**
 * Parser de CSV à mão (0 dependência nova) — cópia do padrão já usado pelos
 * adapters 019–022 (`ingestao/adapters/{tmb,asaas,guru,hotmart}/parse-linha-csv.ts`):
 * detecta separador `,`/`;` pelo cabeçalho, tira BOM, mini state-machine de
 * aspas (`""` = aspa literal). Sem suporte a quebra de linha dentro de aspas
 * (os exports que este projeto processa não têm).
 */

/** Divide **uma** linha de CSV respeitando aspas duplas. */
export function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let emAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (emAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          emAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      emAspas = true;
    } else if (c === sep) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((s) => s.trim());
}

/** `,` vs `;` — o que mais aparece no cabeçalho vence; empate → `,`. */
export function detectarSeparador(cabecalho: string): string {
  const virgulas = (cabecalho.match(/,/g) ?? []).length;
  const pontosVirgula = (cabecalho.match(/;/g) ?? []).length;
  return pontosVirgula > virgulas ? ';' : ',';
}

export interface CsvLido {
  /** cabeçalho em minúsculas, sem espaço nas pontas. */
  cabecalho: string[];
  /** 1 array de campos por linha de dado (sem o cabeçalho). */
  linhas: string[][];
}

/** `null` quando o conteúdo não tem nenhuma linha de dado (só cabeçalho, ou vazio). */
export function lerCsv(conteudo: string): CsvLido | null {
  const texto = conteudo.replace(/^\uFEFF/, '');
  const brutas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (brutas.length < 2) return null;

  const sep = detectarSeparador(brutas[0]);
  const cabecalho = dividirLinha(brutas[0], sep).map((h) => h.toLowerCase());
  const linhas = brutas.slice(1).map((l) => dividirLinha(l, sep));
  return { cabecalho, linhas };
}
