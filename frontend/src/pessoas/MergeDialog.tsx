import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { mensagemErro, pessoasApi } from './pessoas-api';

/** Diálogo de unificação de pessoas (spec 005, `pessoa:merge`). */
export function MergeDialog({
  sobreviventeId,
  onFechar,
  onUnificada,
}: {
  sobreviventeId: string;
  onFechar: () => void;
  onUnificada: () => void;
}) {
  const [absorvidaId, setAbsorvidaId] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const unificar = useMutation({
    mutationFn: () => pessoasApi.merge(sobreviventeId, absorvidaId.trim()),
    onSuccess: onUnificada,
    onError: (e) => setErro(mensagemErro(e)),
  });

  return (
    <div
      role="dialog"
      aria-label="Unificar pessoa"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4"
    >
      <form
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          unificar.mutate();
        }}
      >
        <h2 className="text-base font-semibold text-slate-800">Unificar pessoa</h2>
        <p className="mt-1 text-xs text-slate-500">
          Esta pessoa é a <strong>sobrevivente</strong>. Informe o id da pessoa a ser
          absorvida — os contatos dela virão para cá como secundários. A ação é
          reversível.
        </p>

        <label className="mt-4 block text-sm">
          Id da pessoa absorvida
          <input
            value={absorvidaId}
            onChange={(e) => setAbsorvidaId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
            required
          />
        </label>

        {erro && <p className="mt-3 text-sm text-brand-coral">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={unificar.isPending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-brand-coral)' }}
          >
            Unificar
          </button>
        </div>
      </form>
    </div>
  );
}
