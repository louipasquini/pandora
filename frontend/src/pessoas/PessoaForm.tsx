import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { mensagemErro, pessoasApi } from './pessoas-api';

/** Modal simples de criação de pessoa (spec 005, `pessoa:editar`). */
export function PessoaForm({
  onFechar,
  onCriada,
}: {
  onFechar: () => void;
  onCriada: (id: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [documento, setDocumento] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () =>
      pessoasApi.criar({
        nome: nome.trim(),
        emails: email.trim() ? [email.trim()] : undefined,
        telefones: telefone.trim() ? [telefone.trim()] : undefined,
        documentos: documento.trim() ? [documento.trim()] : undefined,
      }),
    onSuccess: (p) => onCriada(p.id),
    onError: (e) => setErro(mensagemErro(e)),
  });

  return (
    <div
      role="dialog"
      aria-label="Nova pessoa"
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
        <h2 className="text-base font-semibold text-slate-800">Nova pessoa</h2>
        <p className="mt-1 text-xs text-slate-500">
          Informe o nome e ao menos um contato ou documento.
        </p>

        <label className="mt-4 block text-sm">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            required
          />
        </label>
        <label className="mt-3 block text-sm">
          E-mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          Telefone
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          CPF / CNPJ
          <input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
