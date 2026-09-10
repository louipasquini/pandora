import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PainelRender } from './Paineis';
import { MetasPanel } from './MetasPanel';
import { NotificacoesMetaBadge } from './NotificacoesMetaBadge';
import { baixarCsv, montarCsv } from './exportar-csv';
import {
  dashboardApi,
  mensagemErro,
  type FiltrosDashboard,
  type TabelaDados,
  type RankingItem,
  type VisaoView,
} from './dashboard-api';

const PRINT_CSS = `
@media print {
  nav, header, .no-print, aside { display: none !important; }
  main { padding: 0 !important; }
  .painel-card { break-inside: avoid; border: 1px solid #ccc; }
}
`;

function isoDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function csvDoPainel(id: string, dados: unknown): { colunas: string[]; linhas: unknown[][] } | null {
  if (id === 'leads_por_origem') {
    const d = dados as TabelaDados;
    return { colunas: d.colunas, linhas: d.linhas };
  }
  if (id === 'ranking_comercial') {
    const itens = (dados as { itens: RankingItem[] }).itens;
    return {
      colunas: ['responsavel', 'oportunidadesGanhas', 'valorGanho', 'taxaConversao', 'pontosTarefa'],
      linhas: itens.map((i) => [
        i.nome ?? i.responsavelId,
        i.oportunidadesGanhas,
        i.valorGanho.map((v) => `${v.moeda} ${v.valorInt}`).join(' | '),
        i.taxaConversao ?? '',
        i.pontosTarefa,
      ]),
    };
  }
  return null;
}

export function DashboardPage() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(30);
  const [equipeId, setEquipeId] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [pipelineId, setPipelineId] = useState('');

  const filtros: FiltrosDashboard = useMemo(
    () => ({
      de: isoDiasAtras(dias),
      ate: new Date().toISOString().slice(0, 10),
      equipeId: equipeId.trim() || undefined,
      responsavelId: responsavelId.trim() || undefined,
      pipelineId: pipelineId.trim() || undefined,
    }),
    [dias, equipeId, responsavelId, pipelineId],
  );

  const dashboard = useQuery({
    queryKey: ['dashboard', filtros],
    queryFn: () => dashboardApi.montar(filtros),
  });

  const visoes = useQuery({ queryKey: ['dashboard-visoes'], queryFn: () => dashboardApi.visoes() });

  const salvarVisao = useMutation({
    mutationFn: (nome: string) =>
      dashboardApi.criarVisao({
        nome,
        filtros: {
          periodo: { tipo: 'relativo', dias },
          equipeId: equipeId.trim() || undefined,
          responsavelId: responsavelId.trim() || undefined,
          pipelineId: pipelineId.trim() || undefined,
        },
        paineis: dashboard.data?.paineis.map((p) => p.id) ?? [],
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard-visoes'] }),
  });

  const clonar = useMutation({
    mutationFn: (id: string) => dashboardApi.clonarVisao(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard-visoes'] }),
  });

  function aplicarVisao(v: VisaoView) {
    if (v.filtros.periodo.tipo === 'relativo') setDias(v.filtros.periodo.dias);
    setEquipeId(v.filtros.equipeId ?? '');
    setResponsavelId(v.filtros.responsavelId ?? '');
    setPipelineId(v.filtros.pipelineId ?? '');
  }

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-2 no-print">
          <NotificacoesMetaBadge />
          <button
            onClick={() => window.print()}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 no-print">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Período</span>
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="mt-0.5 rounded border border-slate-300 px-2 py-1"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Últimos 12 meses</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Equipe (id)</span>
          <input
            value={equipeId}
            onChange={(e) => setEquipeId(e.target.value)}
            className="mt-0.5 w-44 rounded border border-slate-300 px-2 py-1"
            placeholder="opcional"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Responsável (id)</span>
          <input
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            className="mt-0.5 w-44 rounded border border-slate-300 px-2 py-1"
            placeholder="opcional"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Pipeline (id)</span>
          <input
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="mt-0.5 w-44 rounded border border-slate-300 px-2 py-1"
            placeholder="opcional"
          />
        </label>
        <button
          onClick={() => {
            const nome = window.prompt('Nome da visão');
            if (nome) salvarVisao.mutate(nome);
          }}
          className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          Salvar visão
        </button>
      </div>

      {visoes.data && visoes.data.itens.length > 0 && (
        <div className="flex flex-wrap gap-2 no-print">
          {visoes.data.itens.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs"
            >
              <button onClick={() => aplicarVisao(v)} className="font-medium text-slate-700">
                {v.nome}
              </button>
              {v.somenteLeitura && (
                <button
                  onClick={() => clonar.mutate(v.id)}
                  title="Clonar para uma visão própria"
                  className="text-brand-azul"
                >
                  clonar
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {dashboard.isLoading && <p className="text-sm text-slate-400">Carregando painéis…</p>}
      {dashboard.isError && (
        <p className="text-sm text-brand-coral">{mensagemErro(dashboard.error)}</p>
      )}

      {dashboard.data && (
        <>
          <p className="text-xs text-slate-400 no-print">
            {dashboard.data.periodo.de.slice(0, 10)} a {dashboard.data.periodo.ate.slice(0, 10)} ·
            comparado com {dashboard.data.periodo.anteriorDe.slice(0, 10)} a{' '}
            {dashboard.data.periodo.anteriorAte.slice(0, 10)}
          </p>
          {dashboard.data.paineis.length === 0 && (
            <p className="text-sm text-slate-400">
              Nenhum painel disponível — seu perfil não tem permissão para os painéis do
              dashboard.
            </p>
          )}
          {dashboard.data.paineis.map((p) => {
            const csv = csvDoPainel(p.id, p.dados);
            return (
              <section key={p.id} className="painel-card rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">{p.titulo}</h2>
                  {csv && (
                    <button
                      onClick={() => baixarCsv(p.id, montarCsv(csv.colunas, csv.linhas))}
                      className="text-xs font-medium text-brand-azul hover:underline no-print"
                    >
                      Exportar CSV
                    </button>
                  )}
                </div>
                <PainelRender painel={p} />
              </section>
            );
          })}
        </>
      )}

      <MetasPanel />
    </div>
  );
}
