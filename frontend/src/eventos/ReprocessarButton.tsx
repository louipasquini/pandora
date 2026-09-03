import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { eventosApi } from './eventos-api';

/**
 * Ação **Reprocessar** do detalhe (spec 006) — só aparece com `evento:reprocessar`.
 * Devolve as etapas não-`ok` a `pendente`; o worker as retenta.
 */
export function ReprocessarButton({ eventoId }: { eventoId: string }) {
  const { pode } = usePodeUsar('evento:reprocessar');
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!pode) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setErro(null);
          setOcupado(true);
          try {
            await eventosApi.reprocessar(eventoId);
            await qc.invalidateQueries({ queryKey: ['evento', eventoId] });
          } catch {
            setErro('não foi possível reprocessar');
          } finally {
            setOcupado(false);
          }
        }}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-brand-azul)' }}
      >
        {ocupado ? 'Reprocessando…' : 'Reprocessar'}
      </button>
      {erro && <span className="text-xs text-brand-coral">{erro}</span>}
    </div>
  );
}
