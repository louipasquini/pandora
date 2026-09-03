import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { contasApi } from './contas-api';

function mensagemErro(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'não foi possível concluir a ação';
}

/** Modal de criação de conta (spec 005, `conta:editar`). */
export function ContaForm({
  onFechar,
  onCriada,
}: {
  onFechar: () => void;
  onCriada: (id: string) => void;
}) {
  const [tipo, setTipo] = useState<'HOUSEHOLD' | 'EMPRESA'>('HOUSEHOLD');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => contasApi.criar({ tipo, nome: nome.trim() }),
    onSuccess: (c) => onCriada(c.id),
    onError: (e) => setErro(mensagemErro(e)),
  });

  return (
    <div
      role="dialog"
      aria-label="Nova conta"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4"
    >
      <form
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          criar.mutate();
        }}
      >
        <h2 className="text-base font-semibold text-slate-800">Nova conta</h2>
        <label className="mt-4 block text-sm">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'HOUSEHOLD' | 'EMPRESA')}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="HOUSEHOLD">Household</option>
            <option value="EMPRESA">Empresa</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
            disabled={criar.isPending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Criar
          </button>
        </div>
      </form>
    </div>
  );
}
