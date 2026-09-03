/** Barrel da camada de infraestrutura (Prisma) de `clientes` (spec 005). */
export {
  PessoaRepository,
  type Tx,
  type ContatoView,
  type PessoaDetalheView,
  type PessoaListaItem,
} from './pessoa.repository';
export { ContaRepository, type ContaDetalheView } from './conta.repository';
