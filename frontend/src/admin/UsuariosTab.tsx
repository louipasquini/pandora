import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mensagemErro, rbacApi, type Usuario } from './rbac-api';

/** Aba Usuários: lista + criar (nome/e-mail) + multi-select de perfis. */
export function UsuariosTab() {
  const qc = useQueryClient();
  const usuarios = useQuery({ queryKey: ['rbac', 'usuarios'], queryFn: rbacApi.getUsuarios });
  const perfis = useQuery({ queryKey: ['rbac', 'perfis'], queryFn: rbacApi.getPerfis });

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['rbac', 'usuarios'] });

  const criar = useMutation({
    mutationFn: () => rbacApi.criarUsuario(nome, email),
    onSuccess: () => {
      setNome('');
      setEmail('');
      setErro(null);
      void invalidar();
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  if (usuarios.isLoading || perfis.isLoading) {
    return <p className="text-sm text-slate-500">Carregando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Nome</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-azul"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">E-mail</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-azul"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          {criar.isPending ? 'Criando…' : 'Criar usuário'}
        </button>
        {erro && (
          <p role="alert" className="w-full text-sm text-brand-coral">
            {erro}
          </p>
        )}
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {usuarios.data!.map((u) => (
          <LinhaUsuario
            key={u.id}
            usuario={u}
            perfisDisponiveis={perfis.data!.map((p) => ({ id: p.id, nome: p.nome }))}
            onMudou={() => void invalidar()}
          />
        ))}
        {usuarios.data!.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhum usuário ainda.</li>
        )}
      </ul>
    </div>
  );
}

function LinhaUsuario({
  usuario,
  perfisDisponiveis,
  onMudou,
}: {
  usuario: Usuario;
  perfisDisponiveis: { id: string; nome: string }[];
  onMudou: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(usuario.perfis.map((p) => p.id)));
  const [erro, setErro] = useState<string | null>(null);
  const qc = useQueryClient();

  const salvar = useMutation({
    mutationFn: () => rbacApi.setPerfisDoUsuario(usuario.id, [...sel]),
    onSuccess: () => {
      setErro(null);
      onMudou();
      void qc.invalidateQueries({ queryKey: ['permissoes-efetivas'] });
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  const atuais = new Set(usuario.perfis.map((p) => p.id));
  const mudou =
    sel.size !== atuais.size || [...sel].some((id) => !atuais.has(id));

  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-800">{usuario.nome}</span>
        <span className="text-xs text-slate-500">{usuario.email}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {perfisDisponiveis.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sel.has(p.id)}
              onChange={() =>
                setSel((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                })
              }
            />
            {p.nome}
          </label>
        ))}
      </div>
      {mudou && (
        <button
          type="button"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
          className="mt-2 rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar perfis'}
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-1 text-xs text-brand-coral">
          {erro}
        </p>
      )}
    </li>
  );
}
