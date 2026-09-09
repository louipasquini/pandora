import { EntidadeId } from '../../../core/core.module';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';

/**
 * `sub` do JWT é o id de um `Usuario` **ou** a credencial de serviço (não é
 * UUID, não existe em `usuario`) — mesmo padrão de `resolverMovidoPor`
 * (spec 010, `mover-oportunidade.service.ts`). Usado sempre que um valor
 * derivado de `sub(req)` alimenta uma coluna FK para `usuario` (nunca um
 * campo `autor` texto de auditoria, que aceita a credencial de serviço como
 * string livre).
 */
export async function resolverUsuarioIdOuNulo(
  repo: TarefaRepository,
  sujeito: string | null | undefined,
): Promise<string | null> {
  if (!sujeito || !EntidadeId.isValido(sujeito)) return null;
  return (await repo.usuarioExiste(sujeito)) ? sujeito : null;
}
