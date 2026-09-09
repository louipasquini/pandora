/**
 * Tipos do domínio `tarefa` (spec 016). Puros — sem import de Prisma além do
 * enum (mesma fonte, sem duplicar valores).
 */
import { TarefaStatus } from '@prisma/client';

export { TarefaStatus };

export interface EstadoPrazoTarefa {
  dataVencimento: Date | null;
  status: TarefaStatus;
}

export interface EstadoPrazoResultado {
  vencendoHoje: boolean;
  atrasada: boolean;
}

export interface PeriodoCronometro {
  inicio: Date;
  fim: Date | null;
}

export interface ArestaDependencia {
  tarefaId: string;
  dependeDeId: string;
}

export interface EstadoPontosTarefa {
  concluida: boolean;
  dataVencimento: Date | null;
  concluidoEm: Date | null;
  totalChecklist: number;
  checklistConcluidos: number;
}
