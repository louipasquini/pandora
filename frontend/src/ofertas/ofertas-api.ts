import { apiFetch } from '../auth/api-client';

export interface DinheiroView {
  valorInt: string;
  moeda: string;
}

export type TurmaTipo = 'NUMERO' | 'EVERGREEN' | 'PERPETUO' | 'DESCONHECIDO';

export interface OfertaCatalogoView {
  ticket: DinheiroView | null;
  precoTabela: DinheiroView | null;
  tempoAcessoDias: number | null;
  combo: boolean;
  lancamento: boolean;
  bonus: string[];
  produtosDoComboIds: string[];
}

export interface OfertaResumo {
  id: string;
  produtoId: string;
  turma: { tipo: TurmaTipo | null; numero: number | null };
  subprodutoCodigo: string | null;
  modeloCobrancaCodigo: string | null;
  modeloTransacaoCodigo: string | null;
  turmaTipoCurado: TurmaTipo | null;
  turmaNumeroCurado: number | null;
  turmaTipoDerivado: TurmaTipo | null;
  turmaNumeroDerivado: number | null;
  camposEditados: string[];
  produto: { id: string; codigo: string };
  origensRef: { plataformaOrigem: string; tipoRef: string; valorRef: string }[];
  catalogo: OfertaCatalogoView | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface OfertaLista {
  itens: OfertaResumo[];
  pagina: number;
  tamanho: number;
  total: number;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ListarOfertasParams {
  produtoId?: string;
  produtoCodigo?: string;
  plataformaOrigem?: string;
  pagina?: number;
}

export interface CurarOfertaCatalogoDto {
  ticket?: { valorInt: string; moeda: string } | null;
  precoTabela?: { valorInt: string; moeda: string } | null;
  tempoAcessoDias?: number | null;
  combo?: boolean;
  lancamento?: boolean;
  bonus?: string[];
  produtosDoComboIds?: string[];
}

export interface CurarOfertaDto {
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
  catalogo?: CurarOfertaCatalogoDto;
}

export const ofertasApi = {
  async listar(p: ListarOfertasParams): Promise<OfertaLista> {
    const qs = new URLSearchParams();
    if (p.produtoId) qs.set('produtoId', p.produtoId);
    if (p.produtoCodigo) qs.set('produtoCodigo', p.produtoCodigo);
    if (p.plataformaOrigem) qs.set('plataformaOrigem', p.plataformaOrigem);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return json<OfertaLista>(await apiFetch(`/ofertas?${qs.toString()}`));
  },
  async buscar(id: string): Promise<OfertaResumo> {
    return json<OfertaResumo>(await apiFetch(`/ofertas/${id}`));
  },
  async curar(id: string, dto: CurarOfertaDto): Promise<OfertaResumo> {
    return json<OfertaResumo>(
      await apiFetch(`/ofertas/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    );
  },
};

/** `19700000` (escala ×10000) → `"1.970,00"`. Só exibição — mesmo formato de `transacoes-api`. */
export function formatarDinheiro(d: DinheiroView | null): string {
  if (!d) return '—';
  const negativo = d.valorInt.startsWith('-');
  const abs = negativo ? d.valorInt.slice(1) : d.valorInt;
  const padded = abs.padStart(5, '0');
  const inteiro = padded.slice(0, -4).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = padded.slice(-4, -2);
  return `${negativo ? '-' : ''}${d.moeda} ${inteiro},${centavos}`;
}

export function rotuloTurma(t: { tipo: TurmaTipo | null; numero: number | null }): string {
  if (t.tipo === 'NUMERO') return `Turma ${t.numero}`;
  if (t.tipo === 'EVERGREEN') return 'Evergreen';
  if (t.tipo === 'PERPETUO') return 'Perpétuo';
  if (t.tipo === 'DESCONHECIDO') return 'Turma não reconhecida';
  return 'Turma não identificada';
}
