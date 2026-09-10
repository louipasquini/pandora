import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from './dashboard-api';

/**
 * Alerta de meta (spec 017, FR-012 / CL-02) — só in-app, `refetchInterval` 60s.
 * Mostra a contagem de metas em risco / batidas / estouradas do sujeito.
 */
export function NotificacoesMetaBadge() {
  const q = useQuery({
    queryKey: ['dashboard-notificacoes-meta'],
    queryFn: () => dashboardApi.notificacoes(),
    refetchInterval: 60_000,
  });
  const total = q.data?.itens.length ?? 0;
  if (total === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-coral/10 px-3 py-1 text-xs font-medium text-brand-coral"
      title="Metas em risco ou já batidas no período corrente"
    >
      <span aria-hidden>🎯</span> {total} meta{total > 1 ? 's' : ''} em alerta
    </span>
  );
}
