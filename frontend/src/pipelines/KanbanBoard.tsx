import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { MoverMotivoModal } from './MoverMotivoModal';
import { OportunidadeCard } from './OportunidadeCard';
import { mensagemErro, pipelinesApi, type EtapaView, type OportunidadeView } from './pipelines-api';

/**
 * Board Kanban de um pipeline (spec 010, US7) — colunas por etapa,
 * drag-and-drop HTML5 nativo (research.md: sem dependência nova). Soltar
 * numa etapa `PERDIDA` abre um modal pedindo o motivo antes de confirmar;
 * cancelar não chama a API.
 */
export function KanbanBoard({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const { pode: podeMover } = usePodeUsar('oportunidade:mover');
  const [pendente, setPendente] = useState<{ oportunidadeId: string; etapa: EtapaView } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  const etapas = useQuery({
    queryKey: ['pipeline-etapas', pipelineId],
    queryFn: () => pipelinesApi.listarEtapas(pipelineId),
  });
  const oportunidades = useQuery({
    queryKey: ['oportunidades', pipelineId],
    queryFn: () => pipelinesApi.listarOportunidades({ pipelineId }),
  });

  const mover = useMutation({
    mutationFn: ({ id, etapaId, motivo }: { id: string; etapaId: string; motivo?: string }) =>
      pipelinesApi.mover(id, etapaId, motivo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['oportunidades', pipelineId] });
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  if (etapas.isLoading || oportunidades.isLoading) {
    return <p className="mt-6 text-sm text-slate-500">Carregando board…</p>;
  }
  if (etapas.isError || oportunidades.isError) {
    return <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar o board.</p>;
  }

  const listaEtapas = etapas.data?.itens ?? [];
  const listaOportunidades = oportunidades.data?.itens ?? [];

  function porEtapa(etapaId: string): OportunidadeView[] {
    return listaOportunidades.filter((o) => o.etapaId === etapaId);
  }

  function soltarEm(etapa: EtapaView, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const oportunidadeId = e.dataTransfer.getData('text/plain');
    if (!oportunidadeId) return;
    if (etapa.tipo === 'PERDIDA') {
      setPendente({ oportunidadeId, etapa });
      return;
    }
    mover.mutate({ id: oportunidadeId, etapaId: etapa.id });
  }

  return (
    <div className="mt-4">
      {erro && <p className="mb-2 text-sm text-brand-coral">{erro}</p>}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {listaEtapas.map((etapa) => (
          <div
            key={etapa.id}
            data-testid={`coluna-${etapa.id}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => soltarEm(etapa, e)}
            className="w-64 shrink-0 rounded-lg bg-slate-50 p-2"
          >
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {etapa.nome} ({porEtapa(etapa.id).length})
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {porEtapa(etapa.id).map((o) => (
                <OportunidadeCard
                  key={o.id}
                  oportunidade={o}
                  arrastavel={podeMover}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {listaEtapas.length === 0 && (
          <p className="text-sm text-slate-400">Este pipeline ainda não tem etapas.</p>
        )}
      </div>

      {pendente && (
        <MoverMotivoModal
          etapaNome={pendente.etapa.nome}
          onCancelar={() => setPendente(null)}
          onConfirmar={(motivo) => {
            mover.mutate({ id: pendente.oportunidadeId, etapaId: pendente.etapa.id, motivo });
            setPendente(null);
          }}
        />
      )}
    </div>
  );
}
