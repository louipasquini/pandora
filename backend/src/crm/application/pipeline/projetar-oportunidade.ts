import { agoraUtc } from '../../../core/core.module';
import { calcularEsfriando, calcularSlaEstourado } from '../../domain/pipeline';
import type { OportunidadeRow } from '../../infra/pipeline';

export function projetarOportunidade(
  o: OportunidadeRow,
  extra?: { ultimaReferencia?: Date | null },
) {
  const agora = agoraUtc();
  const ultimaReferencia = extra?.ultimaReferencia ?? o.criadoEm;
  return {
    id: o.id,
    pipelineId: o.pipelineId,
    etapaId: o.etapaId,
    pessoaId: o.pessoaId,
    leadId: o.leadId,
    titulo: o.titulo,
    valorEstimado: { valorInt: o.valorEstimadoInt.toString(), moeda: o.valorEstimadoMoeda },
    responsavelId: o.responsavelId,
    dataPrevistaFechamento: o.dataPrevistaFechamento,
    entrouEtapaEm: o.entrouEtapaEm,
    status: o.etapa.tipo,
    slaEstourado: calcularSlaEstourado(o.etapa.slaHoras, o.entrouEtapaEm, agora),
    esfriando: calcularEsfriando(o.pipeline.diasEsfriando, ultimaReferencia, agora),
    criadoEm: o.criadoEm,
    atualizadoEm: o.atualizadoEm,
  };
}
