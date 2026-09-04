import { useState } from 'react';

/**
 * Modal simples de transferência (spec 012, US3, FR-007). `paraAtendenteId`
 * OU `paraEquipeId` — não há um seletor de usuário/equipe pronto neste
 * módulo ainda, então aceita o id diretamente (uso por quem já sabe o
 * destino, ex.: colado de outra tela) — refinar a busca fica para uma
 * iteração futura de UX, sem bloquear a ação em si.
 */
export function TransferirModal({
  onConfirmar,
  onCancelar,
  pendente,
}: {
  onConfirmar: (dados: { paraAtendenteId?: string; paraEquipeId?: string; motivo?: string }) => void;
  onCancelar: () => void;
  pendente: boolean;
}) {
  const [paraAtendenteId, setParaAtendenteId] = useState('');
  const [paraEquipeId, setParaEquipeId] = useState('');
  const [motivo, setMotivo] = useState('');

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-800">Transferir atendimento</h2>
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs text-slate-600">
            Para atendente (id)
            <input
              aria-label="Para atendente (id)"
              value={paraAtendenteId}
              onChange={(e) => setParaAtendenteId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Ou para equipe (id)
            <input
              aria-label="Ou para equipe (id)"
              value={paraEquipeId}
              onChange={(e) => setParaEquipeId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Motivo (opcional)
            <input
              aria-label="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pendente || (!paraAtendenteId.trim() && !paraEquipeId.trim())}
            onClick={() =>
              onConfirmar({
                paraAtendenteId: paraAtendenteId.trim() || undefined,
                paraEquipeId: paraEquipeId.trim() || undefined,
                motivo: motivo.trim() || undefined,
              })
            }
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            {pendente ? 'Transferindo…' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  );
}
