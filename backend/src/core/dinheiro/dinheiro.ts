import { assertMoeda, criarMoeda, type Moeda } from './moeda';

/**
 * `Dinheiro` — Value Object imutável de quantia monetária (Padrão Transversal
 * "Dinheiro" da constituição).
 *
 * - Valor interno: `bigint` em **escala fixa ×10000** (4 casas decimais).
 *   `float`/`number` fracionário é **proibido** em todo o caminho do valor.
 * - `moeda` (ISO 4217) nunca é opcional.
 * - Soma/subtração/ordem só entre a **mesma moeda** — caso contrário, erro que
 *   nomeia as duas. Não há conversão de moeda, `dividir`, nem "somar lista"
 *   (agregação é `f(eventos)` nos contextos de negócio — Princípio V).
 * - Imutável: toda operação retorna nova instância.
 */

/** Escala fixa: 1 unidade de `valorInt` = 0,0001 da moeda. */
export const ESCALA = 10_000n;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const INTEIRO_RE = /^-?\d+$/;

/** Forma de troca para persistência e JSON. `valorInt` como string para não perder precisão. */
export interface DinheiroSerializado {
  valorInt: string;
  moeda: string;
}

export class Dinheiro {
  private constructor(
    /** Valor na escala ×10000. */
    public readonly valorInt: bigint,
    public readonly moeda: Moeda,
  ) {}

  // --- Construção -----------------------------------------------------------

  /**
   * A partir de uma string decimal canônica: ponto como separador decimal, sem
   * separador de milhar, sinal `-` opcional, **no máximo 4 casas**. Sem `parseFloat`.
   * Formato inválido ou `>4` casas → `RangeError`.
   */
  static deDecimal(texto: string, moeda: string | Moeda): Dinheiro {
    if (typeof texto !== 'string' || !DECIMAL_RE.test(texto)) {
      throw new RangeError(
        `Dinheiro.deDecimal: string decimal inválida: ${JSON.stringify(texto)}`,
      );
    }
    const negativo = texto.startsWith('-');
    const semSinal = negativo ? texto.slice(1) : texto;
    const [parteInteira, fracao = ''] = semSinal.split('.');
    if (fracao.length > 4) {
      throw new RangeError(
        `Dinheiro.deDecimal: mais de 4 casas decimais: ${JSON.stringify(texto)}`,
      );
    }
    const magnitude = BigInt(parteInteira + fracao.padEnd(4, '0'));
    return new Dinheiro(negativo ? -magnitude : magnitude, criarMoeda(moeda));
  }

  /** A partir de um inteiro já na escala ×10000. `number` só se `Number.isInteger`. */
  static deInteiroEscalado(valorInt: bigint | number, moeda: string | Moeda): Dinheiro {
    let v: bigint;
    if (typeof valorInt === 'bigint') {
      v = valorInt;
    } else if (typeof valorInt === 'number' && Number.isInteger(valorInt)) {
      v = BigInt(valorInt);
    } else {
      throw new TypeError(
        `Dinheiro.deInteiroEscalado: valorInt deve ser bigint ou number inteiro, recebido ${JSON.stringify(valorInt)}`,
      );
    }
    return new Dinheiro(v, criarMoeda(moeda));
  }

  /** Quantia nula, ainda carregando moeda. `zero('BRL') !== zero('USD')`. */
  static zero(moeda: string | Moeda): Dinheiro {
    return new Dinheiro(0n, criarMoeda(moeda));
  }

  /** Reidrata da forma serializada (round-trip exato com `toJSON()`). */
  static deSerializado(x: DinheiroSerializado): Dinheiro {
    if (!x || typeof x.valorInt !== 'string' || !INTEIRO_RE.test(x.valorInt)) {
      throw new RangeError(
        `Dinheiro.deSerializado: valorInt inválido: ${JSON.stringify(x?.valorInt)}`,
      );
    }
    assertMoeda(x.moeda);
    return new Dinheiro(BigInt(x.valorInt), x.moeda.toUpperCase() as Moeda);
  }

  // --- Operações ----------------------------------------------------------

  private exigirMesmaMoeda(o: Dinheiro, op: string): void {
    if (this.moeda !== o.moeda) {
      throw new Error(`Dinheiro.${op}: moedas diferentes: ${this.moeda} vs ${o.moeda}`);
    }
  }

  somar(o: Dinheiro): Dinheiro {
    this.exigirMesmaMoeda(o, 'somar');
    return new Dinheiro(this.valorInt + o.valorInt, this.moeda);
  }

  subtrair(o: Dinheiro): Dinheiro {
    this.exigirMesmaMoeda(o, 'subtrair');
    return new Dinheiro(this.valorInt - o.valorInt, this.moeda);
  }

  negar(): Dinheiro {
    return new Dinheiro(-this.valorInt, this.moeda);
  }

  /**
   * Multiplica por um escalar **inteiro** (contagem: parcelas, unidades…).
   * Fator não inteiro / `NaN` / `Infinity` → `TypeError`. Não há arredondamento
   * implícito no `core` — para frações use `ratear` / `ratearPorPesos`.
   */
  multiplicarPorEscalar(fator: bigint | number): Dinheiro {
    let f: bigint;
    if (typeof fator === 'bigint') {
      f = fator;
    } else if (typeof fator === 'number' && Number.isInteger(fator)) {
      f = BigInt(fator);
    } else {
      throw new TypeError(
        `Dinheiro.multiplicarPorEscalar: fator deve ser inteiro, recebido ${JSON.stringify(fator)}`,
      );
    }
    return new Dinheiro(this.valorInt * f, this.moeda);
  }

  // --- Comparações -------------------------------------------------------

  /** Igualdade por valor **e** moeda. Nunca lança; nulo ou moeda diferente → `false`. */
  equals(o: Dinheiro | null | undefined): boolean {
    return o instanceof Dinheiro && o.valorInt === this.valorInt && o.moeda === this.moeda;
  }

  /** Ordem. Exige mesma moeda (senão `Error`); operando não-`Dinheiro` → `TypeError`. */
  compararCom(o: Dinheiro): -1 | 0 | 1 {
    if (!(o instanceof Dinheiro)) {
      throw new TypeError(`Dinheiro.compararCom: operando não é Dinheiro: ${JSON.stringify(o)}`);
    }
    this.exigirMesmaMoeda(o, 'compararCom');
    if (this.valorInt < o.valorInt) return -1;
    if (this.valorInt > o.valorInt) return 1;
    return 0;
  }

  maiorQue(o: Dinheiro): boolean {
    return this.compararCom(o) === 1;
  }

  menorQue(o: Dinheiro): boolean {
    return this.compararCom(o) === -1;
  }

  maiorOuIgual(o: Dinheiro): boolean {
    return this.compararCom(o) >= 0;
  }

  menorOuIgual(o: Dinheiro): boolean {
    return this.compararCom(o) <= 0;
  }

  ehZero(): boolean {
    return this.valorInt === 0n;
  }

  ehNegativo(): boolean {
    return this.valorInt < 0n;
  }

  ehPositivo(): boolean {
    return this.valorInt > 0n;
  }

  // --- Serialização ----------------------------------------------------

  toJSON(): DinheiroSerializado {
    return { valorInt: this.valorInt.toString(), moeda: this.moeda };
  }

  /** Alias explícito de `toJSON()` para leitura em repositório. */
  paraPersistencia(): DinheiroSerializado {
    return this.toJSON();
  }

  /** Forma humana para log/debug — NÃO é a forma de persistência. */
  toString(): string {
    const negativo = this.valorInt < 0n;
    const mag = (negativo ? -this.valorInt : this.valorInt).toString().padStart(5, '0');
    return `${negativo ? '-' : ''}${mag.slice(0, -4)}.${mag.slice(-4)} ${this.moeda}`;
  }
}
