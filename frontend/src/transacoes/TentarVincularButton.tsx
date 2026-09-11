import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { transacoesApi } from './transacoes-api';

/**
 * Ação **Tentar vincular** do detalhe de uma transação Asaas pendente
 * (spec 024) — só aparece com `transacao:vincular`. Reusa a mesma lógica de
 * domínio que a etapa 4 do pipeline já roda automaticamente; serve para
 * retry manual (dado histórico, reprocessamento fora de ordem).
 */
export function TentarVincularButton({ transacaoId }: { transacaoId: string }) {
  const { pode } = usePodeUsar('transacao:vincular');
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  if (!pode) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setMensagem(null);
          setOcupado(true);
          try {
            const r = await transacoesApi.tentarVincular(transacaoId);
            await qc.invalidateQueries({ queryKey: ['transacao', transacaoId] });
            setMensagem(r.vinculado ? 'vínculo resolvido' : 'ainda sem par — continua pendente');
          } catch {
            setMensagem('não foi possível tentar o vínculo');
          } finally {
            setOcupado(false);
          }
        }}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-brand-azul)' }}
      >
        {ocupado ? 'Tentando…' : 'Tentar vincular'}
      </button>
      {mensagem && <span className="text-xs text-slate-500">{mensagem}</span>}
    </div>
  );
}
