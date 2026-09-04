/**
 * Regra de `mover` (spec 010, FR-010) — puro. Etapa destino precisa
 * pertencer ao mesmo pipeline da oportunidade; motivo obrigatório só ao
 * **entrar** numa etapa `PERDIDA`; mover para a etapa atual é no-op.
 */

export type TipoEtapa = 'ABERTA' | 'GANHA' | 'PERDIDA';

export interface EtapaRef {
  id: string;
  pipelineId: string;
  tipo: TipoEtapa;
}

export type ResultadoMovimento =
  | { ok: true; noop: true }
  | { ok: true; noop: false }
  | { ok: false; erro: 'pipeline_diferente' | 'motivo_obrigatorio' };

export function validarMovimento(entrada: {
  etapaAtual: EtapaRef;
  etapaDestino: EtapaRef;
  motivo?: string | null;
}): ResultadoMovimento {
  const { etapaAtual, etapaDestino, motivo } = entrada;

  if (etapaDestino.pipelineId !== etapaAtual.pipelineId) {
    return { ok: false, erro: 'pipeline_diferente' };
  }
  if (etapaDestino.id === etapaAtual.id) {
    return { ok: true, noop: true };
  }
  if (etapaDestino.tipo === 'PERDIDA' && (!motivo || motivo.trim().length === 0)) {
    return { ok: false, erro: 'motivo_obrigatorio' };
  }
  return { ok: true, noop: false };
}
