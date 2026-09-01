import { QueryClient } from '@tanstack/react-query';

/** Cache de server-state compartilhado. Pronto para as próximas specs (FR-026). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
