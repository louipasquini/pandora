import { normalizarTelefone } from '../lead/normalizar-lead';

/**
 * Parser de CSV de contatos avulsos (spec 015, FR-007/US3) — à mão, sem
 * dependência nova (research.md D-R6). Cabeçalho obrigatório com uma coluna
 * `telefone` (aceita variações de caixa/acento simples) e uma coluna `nome`
 * opcional. Separador `,` ou `;`, autodetectado pela 1ª linha; aspas simples
 * (`"valor com, vírgula"`) suportadas; sem suporte a quebra de linha dentro
 * de um campo (fora de escopo — planilha de contato simples, não um
 * importador de dados genérico).
 */
export interface ContatoCsvValido {
  linha: number;
  telefone: string;
  nome: string | null;
}

export interface ContatoCsvInvalido {
  linha: number;
  motivo: string;
}

export interface ResultadoParseCsv {
  validos: ContatoCsvValido[];
  invalidos: ContatoCsvInvalido[];
}

function detectarSeparador(cabecalho: string): ',' | ';' {
  return cabecalho.includes(';') && !cabecalho.includes(',') ? ';' : ',';
}

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentroDeAspas = !dentroDeAspas;
      continue;
    }
    if (c === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizarCabecalho(v: string): string {
  return v.trim().toLowerCase().normalize('NFD').replace(MARCAS_DIACRITICAS, '');
}

export function parseCsvContatos(conteudo: string): ResultadoParseCsv {
  const linhas = conteudo.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (linhas.length === 0) return { validos: [], invalidos: [] };

  const separador = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], separador).map(normalizarCabecalho);
  const idxTelefone = cabecalho.indexOf('telefone');
  const idxNome = cabecalho.indexOf('nome');

  const validos: ContatoCsvValido[] = [];
  const invalidos: ContatoCsvInvalido[] = [];

  if (idxTelefone === -1) {
    return {
      validos: [],
      invalidos: [{ linha: 1, motivo: 'coluna_telefone_ausente' }],
    };
  }

  for (let i = 1; i < linhas.length; i++) {
    const numeroLinha = i + 1;
    const campos = dividirLinha(linhas[i], separador);
    const telefoneBruto = campos[idxTelefone] ?? '';
    if (!telefoneBruto.trim()) {
      invalidos.push({ linha: numeroLinha, motivo: 'telefone_ausente' });
      continue;
    }
    const norm = normalizarTelefone(telefoneBruto);
    if (norm.erro !== undefined) {
      invalidos.push({ linha: numeroLinha, motivo: 'telefone_invalido' });
      continue;
    }
    const nome = idxNome !== -1 ? (campos[idxNome]?.trim() ?? '') : '';
    validos.push({ linha: numeroLinha, telefone: norm.valor as string, nome: nome || null });
  }

  return { validos, invalidos };
}
