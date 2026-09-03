import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

/**
 * Permissões efetivas do sujeito atual (spec 004), servidas por
 * `GET /auth/permissoes-efetivas`. Zero permissão _hardcoded_ no bundle.
 * 403 / erro de rede → conjunto vazio (o gate de UI simplesmente esconde tudo).
 */
export function usePermissoesEfetivas(): {
  permissoes: ReadonlySet<string>;
  isLoading: boolean;
} {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ['permissoes-efetivas', token],
    enabled: token !== null,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const res = await apiFetch('/auth/permissoes-efetivas');
      const body = (await res.json()) as { permissoes?: unknown };
      return Array.isArray(body.permissoes) ? (body.permissoes as string[]) : [];
    },
  });

  return {
    permissoes: new Set(query.data ?? []),
    isLoading: token !== null && query.isLoading,
  };
}

/** Atalho: o sujeito tem a permissão `perm`? (`false` enquanto carrega.) */
export function usePodeUsar(perm: string): { pode: boolean; isLoading: boolean } {
  const { permissoes, isLoading } = usePermissoesEfetivas();
  return { pode: permissoes.has(perm), isLoading };
}
