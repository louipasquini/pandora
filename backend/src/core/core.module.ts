import { Global, Module } from '@nestjs/common';

/**
 * `core` — utilitários canônicos transversais (Princípio I / Padrões Transversais).
 *
 * Nesta spec (001) o `core` entrega:
 *   - `uuidv7()` e o Value Object `EntidadeId` (identidade de entidade)
 *   - o enum `PlataformaOrigem` (as 7 contas)
 *
 * Os Value Objects `Dinheiro`, tempo e status canônico entram na spec 002.
 *
 * `@Global()`: os demais contextos podem depender de `core` sem reimportá-lo
 * (é a única exceção à regra de fronteira entre contextos).
 */
@Global()
@Module({})
export class CoreModule {}

export { EntidadeId } from './ids/entidade-id';
export { uuidv7 } from './ids/uuid';
export {
  PlataformaOrigem,
  PLATAFORMAS_ORIGEM,
  PLATAFORMA_ORIGEM_LABEL,
} from './plataforma-origem.enum';
