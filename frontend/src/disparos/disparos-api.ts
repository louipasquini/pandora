import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- tipos ----

export type ExecucaoDisparoStatus = 'AGENDADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO' | 'ERRO';
export type MensagemDisparoStatus = 'PENDENTE' | 'ENVIANDO' | 'ENVIADA' | 'FALHOU' | 'PULADA';

export interface ContagemPorStatus {
  status: string;
  total: number;
}

export interface ContagemPorVariante {
  variante: 'A' | 'B' | null;
  status: string;
  total: number;
}

export interface ExecucaoDisparoView {
  id: string;
  nome: string;
  canalId: string;
  templateId: string;
  templateBId: string | null;
  percentualVarianteB: number | null;
  segmentoId: string | null;
  csvCriarLead: boolean | null;
  agendadoPara: string | null;
  status: ExecucaoDisparoStatus;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  canceladoEm: string | null;
  erroDetalhe: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ExecucaoDisparoResumo extends ExecucaoDisparoView {
  contagens: ContagemPorStatus[];
}

export interface ExecucaoDisparoDetalhe extends ExecucaoDisparoView {
  contagens: ContagemPorStatus[];
  contagensPorVariante: ContagemPorVariante[];
}

export interface RelatorioImportacaoCsv {
  totalLinhas: number;
  aceitas: number;
  rejeitadas: { linha: number; motivo: string }[];
}

export interface MensagemDisparoView {
  id: string;
  telefone: string;
  pessoaId: string | null;
  leadId: string | null;
  variante: 'A' | 'B' | null;
  status: MensagemDisparoStatus;
  motivo: string | null;
  tentativas: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface CriarDisparoBody {
  nome: string;
  canalId: string;
  templateId: string;
  templateBId?: string;
  percentualVarianteB?: number;
  segmentoId?: string;
  csvConteudo?: string;
  criarLead?: boolean;
  agendadoPara?: string;
}

export interface QualityRatingView {
  qualityRating: string;
  statusExibicao: string | null;
  consultadoEm: string;
}

// ---- API ----

export const disparosApi = {
  listar: (p: { pagina?: number; tamanho?: number; status?: ExecucaoDisparoStatus } = {}) => {
    const qs = new URLSearchParams();
    if (p.pagina) qs.set('pagina', String(p.pagina));
    if (p.tamanho) qs.set('tamanho', String(p.tamanho));
    if (p.status) qs.set('status', p.status);
    return apiFetch(`/crm/disparos?${qs}`).then((r) => json<Pagina<ExecucaoDisparoResumo>>(r));
  },
  obter: (id: string) => apiFetch(`/crm/disparos/${id}`).then((r) => json<ExecucaoDisparoDetalhe>(r)),
  criar: (body: CriarDisparoBody) =>
    apiFetch('/crm/disparos', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<ExecucaoDisparoView & { importacaoCsv?: RelatorioImportacaoCsv }>(r),
    ),
  cancelar: (id: string) => apiFetch(`/crm/disparos/${id}/cancelar`, { method: 'POST' }),
  processar: () => apiFetch('/crm/disparos/processar', { method: 'POST' }),
  listarDestinatarios: (
    id: string,
    p: { pagina?: number; tamanho?: number; status?: MensagemDisparoStatus } = {},
  ) => {
    const qs = new URLSearchParams();
    if (p.pagina) qs.set('pagina', String(p.pagina));
    if (p.tamanho) qs.set('tamanho', String(p.tamanho));
    if (p.status) qs.set('status', p.status);
    return apiFetch(`/crm/disparos/${id}/destinatarios?${qs}`).then((r) =>
      json<Pagina<MensagemDisparoView>>(r),
    );
  },
  exportarUrl: (id: string) => `/crm/disparos/${id}/export`,
  qualityRating: (canalId: string) =>
    apiFetch(`/crm/admin/whatsapp/canais/${canalId}/quality-rating`).then((r) =>
      json<QualityRatingView>(r),
    ),
};

export const STATUS_DISPARO_ROTULO: Record<ExecucaoDisparoStatus, string> = {
  AGENDADO: 'Agendado',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  ERRO: 'Erro',
};

export const STATUS_MENSAGEM_ROTULO: Record<MensagemDisparoStatus, string> = {
  PENDENTE: 'Pendente',
  ENVIANDO: 'Enviando',
  ENVIADA: 'Enviada',
  FALHOU: 'Falhou',
  PULADA: 'Pulada',
};
