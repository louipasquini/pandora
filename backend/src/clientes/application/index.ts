/** Barrel da camada de aplicação de `clientes` (spec 005). */
export {
  ResolverOuCriarService,
  type OpcoesResolver,
  type OrigemDados,
} from './resolver-ou-criar.service';
export { PessoaService, type PessoaDetalheResposta } from './pessoa.service';
export { ContaService, type ContaDetalheResposta } from './conta.service';
export { MergeService } from './merge.service';
export {
  ClientesAuditService,
  type EntidadeClientes,
  type EntradaAuditoria,
} from './clientes-audit.service';
export {
  NotaReconciliacaoService,
  type EntradaNota,
} from './nota-reconciliacao.service';
