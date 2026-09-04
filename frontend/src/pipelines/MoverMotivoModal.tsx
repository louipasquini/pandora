import { useState } from 'react';

/**
 * Modal de motivo obrigatório ao soltar um card numa etapa `PERDIDA` (spec
 * 010, US7). Cancelar não chama a API — o card volta para a coluna original.
 */
export function MoverMotivoModal({
  etapaNome,
  onConfirmar,
  onCancelar,
}: {
  etapaNome: string;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-800">
          Motivo da perda — {etapaNome}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Obrigatório para mover uma oportunidade para esta etapa.
        </p>
        <textarea
          aria-label="Motivo"
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ex.: optou por concorrente"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md px-3 py-1.5 text-sm text-slate-500"
          >
            cancelar
          </button>
          <button
            type="button"
            disabled={motivo.trim() === ''}
            onClick={() => onConfirmar(motivo.trim())}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: 'var(--color-brand-coral)' }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
