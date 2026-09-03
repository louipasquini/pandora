import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { crmAdminApi, type EquipeResumo } from './crm-admin-api';

/** Aba Equipes: lista + criação. Escrita só com `crm_admin:gerir_equipes`. */
export function EquipesTab() {
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('crm_admin:gerir_equipes');
  const lista = useQuery({
    queryKey: ['crm-admin', 'equipes'],
    queryFn: () => crmAdminApi.listarEquipes({}),
  });

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('COMERCIAL');
  const criar = useMutation({
    mutationFn: () => crmAdminApi.criarEquipe({ nome, tipo }),
    onSuccess: () => {
      setNome('');
      void qc.invalidateQueries({ queryKey: ['crm-admin', 'equipes'] });
    },
  });

  if (lista.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (lista.isError)
    return <p className="text-sm text-brand-coral">Não foi possível carregar as equipes.</p>;

  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) criar.mutate();
          }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3"
        >
          <label className="text-xs text-slate-500">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-0.5 block w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="COMERCIAL">Comercial</option>
              <option value="ATENDIMENTO">Atendimento</option>
              <option value="CS">CS</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Criar equipe
          </button>
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {lista.data!.itens.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Nenhuma equipe cadastrada.</li>
        )}
        {lista.data!.itens.map((e: EquipeResumo) => (
          <li key={e.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-800">{e.nome}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                {e.tipo}
              </span>
              {!e.ativo && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">
                  inativa
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {e.totalMembrosAtivos} membro(s)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
