import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { lerSub } from '../auth/decode-jwt';
import { usePodeUsar } from '../auth/usePermissoes';
import { RankingPanel } from './RankingPanel';
import { NotificacoesBadge } from './NotificacoesBadge';
import { mensagemErro, STATUS_ROTULO, tarefasApi, type TarefaStatus, type TarefaView } from './tarefas-api';

type Aba = 'minhas' | 'gerais' | 'todas';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function StatusBadge({ status }: { status: TarefaStatus }) {
  const cor: Record<TarefaStatus, string> = {
    PENDENTE: 'bg-slate-100 text-slate-600',
    EM_ANDAMENTO: 'bg-brand-azul/10 text-brand-azul',
    CONCLUIDA: 'bg-brand-menta/20 text-emerald-700',
    CANCELADA: 'bg-slate-100 text-slate-400 line-through',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cor[status]}`}>
      {STATUS_ROTULO[status]}
    </span>
  );
}

function NovaTarefaForm({ onClose, onCriou }: { onClose: () => void; onCriou: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [checklistTexto, setChecklistTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () =>
      tarefasApi.criar({
        titulo: titulo.trim(),
        dataVencimento: dataVencimento ? new Date(dataVencimento).toISOString() : undefined,
        responsavelId: responsavelId.trim() || undefined,
        checklist: checklistTexto
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      }),
    onSuccess: onCriou,
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        if (!titulo.trim()) {
          setErro('preencha o título');
          return;
        }
        criar.mutate();
      }}
      className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
    >
      <h2 className="text-sm font-medium text-slate-700">Nova tarefa</h2>
      <input
        aria-label="Título"
        placeholder="Título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <div className="flex gap-3">
        <input
          aria-label="Prazo"
          type="datetime-local"
          value={dataVencimento}
          onChange={(e) => setDataVencimento(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          aria-label="Responsável (id do usuário; vazio = geral)"
          placeholder="Responsável (vazio = geral)"
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <textarea
        aria-label="Checklist (um item por linha)"
        placeholder="Checklist — um item por linha (opcional)"
        value={checklistTexto}
        onChange={(e) => setChecklistTexto(e.target.value)}
        rows={3}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      {erro && <p className="text-sm text-brand-coral">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-azul px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Criar
        </button>
      </div>
    </form>
  );
}

/** CRM · Tarefas (spec 016) — gestor de tarefas pessoal e geral. */
export function TarefasPage() {
  const { token } = useAuth();
  const subBruto = token ? lerSub(token) : null;
  // A credencial de serviço (login único do painel, spec 003) não é o id de
  // um `Usuario` real — só filtra por `responsavelId` quando o sujeito for
  // de fato um usuário RBAC (spec 004), senão o backend rejeita (não-UUID).
  const meuId = subBruto && UUID_RE.test(subBruto) ? subBruto : null;
  const { pode: podeVerTodas } = usePodeUsar('tarefa:ver_todas');
  const { pode: podeCriar } = usePodeUsar('tarefa:criar');
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>('minhas');
  const [statusFiltro, setStatusFiltro] = useState<TarefaStatus | ''>('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarRanking, setMostrarRanking] = useState(false);

  const lista = useQuery({
    queryKey: ['tarefas', aba, statusFiltro, meuId],
    queryFn: () =>
      tarefasApi.listar({
        status: statusFiltro || undefined,
        responsavelId: aba === 'minhas' && meuId ? meuId : undefined,
      }),
  });

  const itensFiltrados = useMemo(() => {
    const itens = lista.data?.itens ?? [];
    if (aba === 'gerais') return itens.filter((t) => t.responsavelId === null);
    return itens;
  }, [lista.data, aba]);

  const refetch = () => void qc.invalidateQueries({ queryKey: ['tarefas'] });

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Tarefas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Checklists, cronômetro, dependências, delegação e pontos por conclusão.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificacoesBadge />
          {podeCriar && !mostrarForm && (
            <button
              type="button"
              onClick={() => setMostrarForm(true)}
              className="rounded-md bg-brand-azul px-3 py-1.5 text-sm font-medium text-white"
            >
              Nova tarefa
            </button>
          )}
        </div>
      </div>

      {mostrarForm && (
        <NovaTarefaForm
          onClose={() => setMostrarForm(false)}
          onCriou={() => {
            setMostrarForm(false);
            refetch();
          }}
        />
      )}

      <div className="mt-6 flex items-center gap-2 border-b border-slate-200">
        {(['minhas', 'gerais', ...(podeVerTodas ? (['todas'] as const) : [])] as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={`border-b-2 px-3 py-2 text-sm ${
              aba === a ? 'border-brand-azul text-brand-azul' : 'border-transparent text-slate-500'
            }`}
          >
            {a === 'minhas' ? 'Minhas' : a === 'gerais' ? 'Gerais' : 'Todas'}
          </button>
        ))}
        <div className="ml-auto pb-2">
          <select
            aria-label="Filtrar por status"
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as TarefaStatus | '')}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_ROTULO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aba === 'minhas' && !meuId && (
        <p className="mt-3 text-xs text-slate-400">
          Autenticado com a credencial de serviço — mostrando todas as tarefas no seu escopo de
          visão (não há um usuário específico para filtrar "minhas").
        </p>
      )}

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar as tarefas.</p>}

      {lista.data && itensFiltrados.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">Nenhuma tarefa por aqui.</p>
      )}

      {itensFiltrados.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-2">Título</th>
              <th className="py-2">Status</th>
              <th className="py-2">Prazo</th>
              <th className="py-2">Checklist</th>
              <th className="py-2">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map((t: TarefaView) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2">
                  <Link to={`/crm/tarefas/${t.id}`} className="font-medium text-brand-azul">
                    {t.titulo}
                  </Link>
                  {t.atrasada && <span className="ml-2 text-xs text-brand-coral">atrasada</span>}
                  {t.vencendoHoje && <span className="ml-2 text-xs text-amber-600">vence hoje</span>}
                </td>
                <td className="py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="py-2 text-slate-500">
                  {t.dataVencimento ? new Date(t.dataVencimento).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="py-2 text-slate-500">
                  {t.progressoChecklist.total > 0
                    ? `${t.progressoChecklist.concluidos}/${t.progressoChecklist.total}`
                    : '—'}
                </td>
                <td className="py-2 text-slate-500">{t.responsavelId ?? 'geral'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setMostrarRanking((v) => !v)}
          className="text-sm text-brand-azul"
        >
          {mostrarRanking ? 'ocultar ranking' : 'ver ranking de pontos'}
        </button>
        {mostrarRanking && (
          <div className="mt-3">
            <RankingPanel />
          </div>
        )}
      </div>
    </section>
  );
}
