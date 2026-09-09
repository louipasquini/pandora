import type { TarefaChecklistItem } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { calcularEstadoPrazo, tempoTotalSegundos } from '../../domain/tarefa';
import type { TarefaRow } from '../../infra/tarefa/tarefa.repository';

export interface TarefaProjetada {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TarefaRow['status'];
  dataVencimento: Date | null;
  concluidoEm: Date | null;
  pessoaId: string | null;
  leadId: string | null;
  oportunidadeId: string | null;
  responsavelId: string | null;
  criadoPorId: string | null;
  origem: string;
  criadoEm: Date;
  atualizadoEm: Date;
  checklist: TarefaChecklistItem[];
  progressoChecklist: { concluidos: number; total: number };
  tempoTotalSegundos: number;
  vencendoHoje: boolean;
  atrasada: boolean;
}

/** `f(row) -> projeção` — nada aqui é persistido (Princípio V). */
export function projetarTarefa(row: TarefaRow): TarefaProjetada {
  const agora = agoraUtc();
  const prazo = calcularEstadoPrazo({ dataVencimento: row.dataVencimento, status: row.status }, agora);
  const concluidos = row.checklist.filter((i) => i.concluido).length;

  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    status: row.status,
    dataVencimento: row.dataVencimento,
    concluidoEm: row.concluidoEm,
    pessoaId: row.pessoaId,
    leadId: row.leadId,
    oportunidadeId: row.oportunidadeId,
    responsavelId: row.responsavelId,
    criadoPorId: row.criadoPorId,
    origem: row.origem,
    criadoEm: row.criadoEm,
    atualizadoEm: row.atualizadoEm,
    checklist: [...row.checklist].sort((a, b) => a.ordem - b.ordem),
    progressoChecklist: { concluidos, total: row.checklist.length },
    tempoTotalSegundos: tempoTotalSegundos(row.periodos, agora),
    vencendoHoje: prazo.vencendoHoje,
    atrasada: prazo.atrasada,
  };
}
