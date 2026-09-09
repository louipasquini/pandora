import { useQuery } from '@tanstack/react-query';
import { workflowApi } from './workflow-api';

const RESULTADO_ROTULO: Record<string, string> = {
  EXECUTADA: 'executada',
  CONDICAO_NAO_SATISFEITA: 'condição não satisfeita',
  FALHOU: 'falhou',
};

const RESULTADO_COR: Record<string, string> = {
  EXECUTADA: 'text-brand-menta',
  CONDICAO_NAO_SATISFEITA: 'text-slate-400',
  FALHOU: 'text-brand-coral',
};

/** Histórico de execuções do fluxo (spec 014, US5) — sempre append-only. */
export function ExecucoesTab({ fluxoId }: { fluxoId: string }) {
  const execucoes = useQuery({
    queryKey: ['workflow', 'execucoes', fluxoId],
    queryFn: () => workflowApi.listarExecucoes(fluxoId),
  });

  if (execucoes.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (execucoes.isError) {
    return <p className="text-sm text-brand-coral">Não foi possível carregar as execuções.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded border border-slate-200">
      {execucoes.data!.length === 0 && (
        <li className="px-3 py-6 text-center text-sm text-slate-400">nenhuma execução ainda</li>
      )}
      {execucoes.data!.map((e) => (
        <li key={e.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span>
              {e.registroTipo} {e.registroId}
            </span>
            <span className={RESULTADO_COR[e.resultado]}>{RESULTADO_ROTULO[e.resultado]}</span>
          </div>
          <span className="text-xs text-slate-400">{new Date(e.criadoEm).toLocaleString('pt-BR')}</span>
          {e.erroDetalhe && <p className="mt-1 text-xs text-brand-coral">{e.erroDetalhe}</p>}
        </li>
      ))}
    </ul>
  );
}
