import { PERFIL_ADMIN_ID } from '../auth.constants';
import { PERMISSAO_IDS, PERMISSOES, type Permissao } from './catalogo';

/** Perfil como a resolução precisa dele: id + lista crua de permissões. */
export interface PerfilResolucao {
  id: string;
  permissoes: string[];
}

/** Todas as permissões do catálogo (o que o `administrador` concede). */
export function todasAsPermissoes(): ReadonlySet<Permissao> {
  return new Set(PERMISSOES.map((p) => p.id));
}

/**
 * Permissões efetivas de um sujeito = **união** das permissões dos seus perfis,
 * filtradas pelo catálogo atual (permissão órfã é ignorada — Princípio VII).
 *
 * Se algum perfil é o `administrador` (id de sistema), o resultado é o catálogo
 * **inteiro em código** — assim "o admin ganha permissões de specs futuras sem
 * intervenção" vale mesmo com o seed defasado (FR-007 / FR-024).
 *
 * Função pura, testável sem banco.
 */
export function resolverPermissoesEfetivas(
  perfis: readonly PerfilResolucao[],
): ReadonlySet<Permissao> {
  if (perfis.some((p) => p.id === PERFIL_ADMIN_ID)) {
    return todasAsPermissoes();
  }
  const efetivas = new Set<Permissao>();
  for (const perfil of perfis) {
    for (const permissao of perfil.permissoes) {
      if (PERMISSAO_IDS.has(permissao)) {
        efetivas.add(permissao as Permissao);
      }
    }
  }
  return efetivas;
}
