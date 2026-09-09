import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  mensagemErro,
  STATUS_ROTULO,
  tarefasApi,
  type TarefaStatus,
} from './tarefas-api';

const TRANSICOES: Record<TarefaStatus, TarefaStatus[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  EM_ANDAMENTO: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['PENDENTE'],
  CANCELADA: [],
};

function formatarSegundos(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m}m ${s}s`;
}

/** Detalhe de uma tarefa (spec 016): checklist, cronômetro, comentários, dependências, delegação. */
export function TarefaDetalhePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('tarefa:editar');
  const { pode: podeDelegar } = usePodeUsar('tarefa:delegar');
  const [erro, setErro] = useState<string | null>(null);
  const [novoItem, setNovoItem] = useState('');
  const [novaNota, setNovaNota] = useState('');
  const [dependeDeId, setDependeDeId] = useState('');
  const [delegarPara, setDelegarPara] = useState('');
  const [delegarMotivo, setDelegarMotivo] = useState('');

  const tarefa = useQuery({ queryKey: ['tarefa', id], queryFn: () => tarefasApi.obter(id) });
  const notas = useQuery({ queryKey: ['tarefa-notas', id], queryFn: () => tarefasApi.listarNotas(id) });
  const dependencias = useQuery({
    queryKey: ['tarefa-dependencias', id],
    queryFn: () => tarefasApi.listarDependencias(id),
  });
  const delegacoes = useQuery({
    queryKey: ['tarefa-delegacoes', id],
    queryFn: () => tarefasApi.listarDelegacoes(id),
  });

  const refetch = () => {
    void qc.invalidateQueries({ queryKey: ['tarefa', id] });
    void qc.invalidateQueries({ queryKey: ['tarefa-notas', id] });
    void qc.invalidateQueries({ queryKey: ['tarefa-dependencias', id] });
    void qc.invalidateQueries({ queryKey: ['tarefa-delegacoes', id] });
  };
  const comErro =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    (...a: A) =>
      fn(...a).catch((e: unknown) => {
        setErro(mensagemErro(e));
        throw e;
      });

  const mudarStatus = useMutation({
    mutationFn: comErro((status: TarefaStatus) => tarefasApi.mudarStatus(id, status)),
    onSuccess: refetch,
  });
  const toggleItem = useMutation({
    mutationFn: comErro(({ itemId, concluido }: { itemId: string; concluido: boolean }) =>
      tarefasApi.atualizarItemChecklist(id, itemId, { concluido }),
    ),
    onSuccess: refetch,
  });
  const adicionarItem = useMutation({
    mutationFn: comErro((texto: string) => tarefasApi.criarItemChecklist(id, texto)),
    onSuccess: () => {
      setNovoItem('');
      refetch();
    },
  });
  const iniciar = useMutation({ mutationFn: comErro(() => tarefasApi.iniciarCronometro(id)), onSuccess: refetch });
  const parar = useMutation({ mutationFn: comErro(() => tarefasApi.pararCronometro(id)), onSuccess: refetch });
  const comentar = useMutation({
    mutationFn: comErro((conteudo: string) => tarefasApi.criarNota(id, conteudo)),
    onSuccess: () => {
      setNovaNota('');
      refetch();
    },
  });
  const adicionarDependencia = useMutation({
    mutationFn: comErro((dep: string) => tarefasApi.adicionarDependencia(id, dep)),
    onSuccess: () => {
      setDependeDeId('');
      refetch();
    },
  });
  const removerDependencia = useMutation({
    mutationFn: comErro((dep: string) => tarefasApi.removerDependencia(id, dep)),
    onSuccess: refetch,
  });
  const delegar = useMutation({
    mutationFn: comErro(() => tarefasApi.delegar(id, delegarPara.trim() || null, delegarMotivo.trim() || undefined)),
    onSuccess: () => {
      setDelegarPara('');
      setDelegarMotivo('');
      refetch();
    },
  });

  if (tarefa.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (tarefa.isError || !tarefa.data)
    return <p className="p-6 text-sm text-brand-coral">Tarefa não encontrada.</p>;

  const t = tarefa.data;

  return (
    <section className="mx-auto max-w-3xl">
      <Link to="/crm/tarefas" className="text-sm text-brand-azul">
        ← Tarefas
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t.titulo}</h1>
        <span className="text-xs text-slate-400">{STATUS_ROTULO[t.status]}</span>
      </div>
      {t.descricao && <p className="mt-1 text-sm text-slate-500">{t.descricao}</p>}
      <p className="mt-1 text-xs text-slate-400">
        Prazo: {t.dataVencimento ? new Date(t.dataVencimento).toLocaleString('pt-BR') : 'sem prazo'}
        {t.atrasada && <span className="ml-2 text-brand-coral">atrasada</span>}
        {t.vencendoHoje && <span className="ml-2 text-amber-600">vence hoje</span>}
      </p>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}

      {podeEditar && TRANSICOES[t.status].length > 0 && (
        <div className="mt-3 flex gap-2">
          {TRANSICOES[t.status].map((destino) => (
            <button
              key={destino}
              type="button"
              onClick={() => mudarStatus.mutate(destino)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {destino === 'PENDENTE' && t.status === 'CONCLUIDA' ? 'Reabrir' : STATUS_ROTULO[destino]}
            </button>
          ))}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">
          Checklist ({t.progressoChecklist.concluidos}/{t.progressoChecklist.total})
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {t.checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.concluido}
                disabled={!podeEditar}
                onChange={(e) => toggleItem.mutate({ itemId: item.id, concluido: e.target.checked })}
              />
              <span className={item.concluido ? 'text-slate-400 line-through' : 'text-slate-700'}>
                {item.texto}
              </span>
            </li>
          ))}
        </ul>
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (novoItem.trim()) adicionarItem.mutate(novoItem.trim());
            }}
            className="mt-3 flex gap-2"
          >
            <input
              aria-label="Novo item do checklist"
              value={novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              placeholder="Novo item"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md bg-brand-azul px-3 py-1 text-sm text-white">
              Adicionar
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">
          Cronômetro — total {formatarSegundos(t.tempoTotalSegundos)}
        </h2>
        {podeEditar && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => iniciar.mutate()}
              disabled={iniciar.isPending}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
            >
              Iniciar
            </button>
            <button
              type="button"
              onClick={() => parar.mutate()}
              disabled={parar.isPending}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
            >
              Parar
            </button>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">Acompanhamento</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {(notas.data?.itens ?? []).map((n) => (
            <li key={n.id} className="text-sm text-slate-600">
              <span className="text-xs text-slate-400">
                {new Date(n.criadoEm).toLocaleString('pt-BR')} —{' '}
              </span>
              {n.conteudo}
            </li>
          ))}
        </ul>
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (novaNota.trim()) comentar.mutate(novaNota.trim());
            }}
            className="mt-3 flex gap-2"
          >
            <input
              aria-label="Novo comentário"
              value={novaNota}
              onChange={(e) => setNovaNota(e.target.value)}
              placeholder="Comentário de acompanhamento"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md bg-brand-azul px-3 py-1 text-sm text-white">
              Comentar
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">Dependências</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {(dependencias.data?.itens ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <Link to={`/crm/tarefas/${d.dependeDe.id}`} className="text-brand-azul">
                {d.dependeDe.titulo} ({STATUS_ROTULO[d.dependeDe.status]})
              </Link>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => removerDependencia.mutate(d.dependeDeId)}
                  className="text-xs text-slate-400 hover:text-brand-coral"
                >
                  remover
                </button>
              )}
            </li>
          ))}
          {(dependencias.data?.itens ?? []).length === 0 && (
            <li className="text-sm text-slate-400">Sem dependências.</li>
          )}
        </ul>
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dependeDeId.trim()) adicionarDependencia.mutate(dependeDeId.trim());
            }}
            className="mt-3 flex gap-2"
          >
            <input
              aria-label="Id da tarefa da qual esta depende"
              value={dependeDeId}
              onChange={(e) => setDependeDeId(e.target.value)}
              placeholder="Id da tarefa da qual esta depende"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md bg-brand-azul px-3 py-1 text-sm text-white">
              Adicionar
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">Responsável</h2>
        <p className="mt-1 text-sm text-slate-600">{t.responsavelId ?? 'geral (sem responsável)'}</p>
        {podeDelegar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              delegar.mutate();
            }}
            className="mt-3 flex flex-wrap gap-2"
          >
            <input
              aria-label="Novo responsável (vazio = geral)"
              value={delegarPara}
              onChange={(e) => setDelegarPara(e.target.value)}
              placeholder="Novo responsável (vazio = geral)"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              aria-label="Motivo"
              value={delegarMotivo}
              onChange={(e) => setDelegarMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md bg-brand-azul px-3 py-1 text-sm text-white">
              Delegar
            </button>
          </form>
        )}
        {(delegacoes.data?.itens ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-400">
            {delegacoes.data?.itens.map((d) => (
              <li key={d.id}>
                {new Date(d.criadoEm).toLocaleString('pt-BR')} — de {d.deResponsavelId ?? 'geral'} para{' '}
                {d.paraResponsavelId ?? 'geral'}
                {d.motivo ? ` (${d.motivo})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
