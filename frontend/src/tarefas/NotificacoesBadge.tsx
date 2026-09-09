import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { tarefasApi } from './tarefas-api';

/** "Minhas notificações" (spec 016, CL-02) — só in-app, sem envio externo. */
export function NotificacoesBadge() {
  const notif = useQuery({
    queryKey: ['tarefas-notificacoes'],
    queryFn: () => tarefasApi.notificacoes(),
    refetchInterval: 60_000,
  });
  const total = notif.data?.itens.length ?? 0;
  if (total === 0) return null;

  return (
    <Link
      to="/crm/tarefas?aba=minhas"
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-coral/10 px-3 py-1 text-xs font-medium text-brand-coral"
      title="Tarefas vencendo hoje ou atrasadas"
    >
      <span aria-hidden>⏰</span> {total} tarefa{total > 1 ? 's' : ''} vencendo/atrasada
      {total > 1 ? 's' : ''}
    </Link>
  );
}
