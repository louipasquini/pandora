import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  mensagemErro,
  rbacApi,
  type Perfil,
  type RecursoAgrupado,
} from './rbac-api';

/** Aba Perfis: lista + editor com checklist de permissões agrupado por recurso. */
export function PerfisTab() {
  const qc = useQueryClient();
  const perfis = useQuery({ queryKey: ['rbac', 'perfis'], queryFn: rbacApi.getPerfis });
  const catalogo = useQuery({
    queryKey: ['rbac', 'permissoes'],
    queryFn: rbacApi.getPermissoes,
    staleTime: 5 * 60_000,
  });

  const [editando, setEditando] = useState<Perfil | 'novo' | null>(null);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['rbac', 'perfis'] });
    void qc.invalidateQueries({ queryKey: ['permissoes-efetivas'] });
  };

  if (perfis.isLoading || catalogo.isLoading) {
    return <p className="text-sm text-slate-500">Carregando…</p>;
  }
  if (perfis.isError) {
    return <p className="text-sm text-brand-coral">Não foi possível carregar os perfis.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {perfis.data!.length} perfil(is)
        </h2>
        <button
          type="button"
          onClick={() => setEditando('novo')}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          Novo perfil
        </button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {perfis.data!.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-800">{p.nome}</span>
              {p.deSistema && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                  perfil de sistema
                </span>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {p.permissoes.length} permissão(ões) · {p.totalUsuarios} usuário(s)
                {p.permissoesDesconhecidas.length > 0 &&
                  ` · ${p.permissoesDesconhecidas.length} desconhecida(s)`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditando(p)}
              className="text-sm text-brand-azul hover:underline"
            >
              {p.deSistema ? 'Ver' : 'Editar'}
            </button>
          </li>
        ))}
      </ul>

      {editando && (
        <EditorPerfil
          perfil={editando === 'novo' ? null : editando}
          catalogo={catalogo.data!}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            invalidar();
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditorPerfil({
  perfil,
  catalogo,
  onFechar,
  onSalvo,
}: {
  perfil: Perfil | null;
  catalogo: RecursoAgrupado[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const readonly = perfil?.deSistema ?? false;
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [marcadas, setMarcadas] = useState<Set<string>>(
    new Set(perfil?.permissoes ?? []),
  );
  const [erro, setErro] = useState<string | null>(null);
  const qc = useQueryClient();

  const idsDoCatalogo = useMemo(
    () => catalogo.flatMap((r) => r.permissoes.map((p) => p.id)),
    [catalogo],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const permissoes = idsDoCatalogo.filter((id) => marcadas.has(id));
      if (perfil) {
        await rbacApi.editarPerfil(perfil.id, { nome, permissoes });
      } else {
        await rbacApi.criarPerfil(nome, permissoes);
      }
    },
    onSuccess: onSalvo,
    onError: (e) => setErro(mensagemErro(e)),
  });

  const apagar = useMutation({
    mutationFn: () => rbacApi.apagarPerfil(perfil!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'perfis'] });
      onSalvo();
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  function alternar(id: string) {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function alternarRecurso(r: RecursoAgrupado) {
    const ids = r.permissoes.map((p) => p.id);
    const todasMarcadas = ids.every((id) => marcadas.has(id));
    setMarcadas((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (todasMarcadas) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          {perfil ? `Perfil: ${perfil.nome}` : 'Novo perfil'}
          {readonly && ' (somente leitura)'}
        </h3>
        <button type="button" onClick={onFechar} className="text-sm text-slate-500 hover:underline">
          Fechar
        </button>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Nome</span>
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-azul disabled:bg-slate-100"
          value={nome}
          disabled={readonly}
          onChange={(e) => setNome(e.target.value)}
        />
      </label>

      <fieldset className="mt-4" disabled={readonly}>
        <legend className="text-sm font-medium text-slate-700">Permissões</legend>
        <div className="mt-2 flex flex-col gap-4">
          {catalogo.map((r) => {
            const ids = r.permissoes.map((p) => p.id);
            const todas = ids.every((id) => marcadas.has(id));
            return (
              <div key={r.recurso}>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <input
                    type="checkbox"
                    checked={todas}
                    onChange={() => alternarRecurso(r)}
                  />
                  {r.recurso}
                </label>
                <div className="mt-1 flex flex-col gap-1 pl-5">
                  {r.permissoes.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={marcadas.has(p.id)}
                        onChange={() => alternar(p.id)}
                      />
                      {p.rotulo}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {perfil && perfil.permissoesDesconhecidas.length > 0 && (
        <p className="mt-3 rounded bg-slate-100 px-3 py-2 text-xs text-slate-500">
          Permissões não reconhecidas (ignoradas): {perfil.permissoesDesconhecidas.join(', ')}
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-3 text-sm text-brand-coral">
          {erro}
        </p>
      )}

      {!readonly && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending || nome.trim() === ''}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
          {perfil && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Apagar o perfil "${perfil.nome}"?`)) apagar.mutate();
              }}
              disabled={apagar.isPending}
              className="rounded-md border border-brand-coral px-4 py-2 text-sm font-medium text-brand-coral"
            >
              Apagar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
