import { uuidv7 } from './uuid';

/** UUID canônico (RFC 4122), qualquer versão. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Value Object de identificador de entidade. Wrapper tipado sobre um UUID v7.
 *
 * Toda entidade do domínio Pandora nasce com um `EntidadeId` (Princípio I da
 * constituição). IDs nunca circulam como `string` crua na camada de domínio:
 * isso impede confundir o ID de uma entidade com o de outra em tempo de
 * compilação e centraliza geração/validação.
 *
 * Imutável. Igualdade por valor (`equals`).
 */
export class EntidadeId {
  /** UUID v7 canônico, minúsculas. */
  public readonly value: string;

  constructor(value: string) {
    const normalized = value?.toLowerCase?.();
    if (!normalized || !UUID_RE.test(normalized)) {
      throw new TypeError(`EntidadeId inválido: ${JSON.stringify(value)}`);
    }
    // 13º caractere hex (1º nibble do 3º grupo) carrega a versão.
    const version = normalized[14];
    if (version !== '7') {
      throw new TypeError(`EntidadeId deve ser UUID v7 (versão recebida: ${version})`);
    }
    this.value = normalized;
  }

  /** Gera um novo identificador. */
  static novo(): EntidadeId {
    return new EntidadeId(uuidv7());
  }

  /** Reidrata a partir da representação de persistência (nome explícito p/ leitura). */
  static de(value: string): EntidadeId {
    return new EntidadeId(value);
  }

  /** `true` se `value` é um UUID v7 válido. */
  static isValido(value: unknown): value is string {
    return (
      typeof value === 'string' && UUID_RE.test(value.toLowerCase()) && value.toLowerCase()[14] === '7'
    );
  }

  equals(other: EntidadeId | null | undefined): boolean {
    return other instanceof EntidadeId && other.value === this.value;
  }

  /** Representação para persistência (coluna Postgres `uuid`). */
  toDb(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
