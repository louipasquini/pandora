/**
 * Planos puros de merge e de reversão (spec 005, US4). Sem I/O — recebem o estado
 * como dados simples e devolvem "o que fazer". O `MergeService` (application)
 * executa numa transação Prisma.
 *
 * Reversível **em qualquer ordem** (CL-03): a reversão opera só sobre as linhas
 * cuja proveniência (`origemMergeId`) é EXATAMENTE o merge sendo desfeito. Linhas
 * re-movidas por um merge posterior têm outra proveniência e são deixadas em paz.
 * Linha tocada por curadoria (`curado === true`) prevalece e vira `Divergencia`.
 */

export interface SnapshotContato {
  valor: string;
  primario: boolean;
  curado: boolean;
  rebaixadoEm: string | null;
}
export interface SnapshotDocumento {
  tipo: 'CPF' | 'CNPJ';
  valor: string;
  curado: boolean;
}
export interface SnapshotEndereco {
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  pais: string;
  curado: boolean;
}
export interface SnapshotOrigemRef {
  plataformaOrigem: string;
  tipoRef: string;
  valorRef: string;
}
export interface SnapshotPessoa {
  id: string;
  nome: string;
  tipo: string;
  contaId: string | null;
  emails: SnapshotContato[];
  telefones: SnapshotContato[];
  documentos: SnapshotDocumento[];
  enderecos: SnapshotEndereco[];
  origemRefs: SnapshotOrigemRef[];
}
export interface SnapshotConta {
  id: string;
  nome: string;
  tipo: string;
  membros: string[];
}

export interface SnapshotMergePessoa {
  sobrevivente: SnapshotPessoa;
  absorvida: SnapshotPessoa;
}
export interface SnapshotMergeConta {
  sobrevivente: SnapshotConta;
  absorvida: SnapshotConta;
}

/** Uma linha filha atualmente na sobrevivente que ESTE merge moveu. */
export interface LinhaProvenienciada {
  id: string;
  tabela: 'email' | 'telefone' | 'documento' | 'endereco' | 'origemRef';
  /** chave de comparação com o snapshot (valor / `${tipo}:${valor}` / etc.) */
  chave: string;
  curado: boolean;
  primario: boolean;
}

export interface Divergencia {
  campo: string;
  valorAtual: unknown;
  valorSnapshot: unknown;
  motivo: 'divergiu_pos_merge';
}

export interface PlanoMerge {
  /** contatos movidos entram como secundários (não promovem sobre o primário da sobrevivente). */
  contatosComoSecundario: boolean;
}

export interface PlanoReversao {
  /** ids de linhas (com proveniência deste merge, não curadas) que voltam para a absorvida. */
  moverParaAbsorvida: string[];
  /** linhas com proveniência deste merge que foram curadas depois — ficam onde estão. */
  divergencias: Divergencia[];
  /** filhas do snapshot da absorvida que não têm linha viva correspondente — recriar na absorvida. */
  recriarNaAbsorvida: {
    emails: SnapshotContato[];
    telefones: SnapshotContato[];
    documentos: SnapshotDocumento[];
    enderecos: SnapshotEndereco[];
    origemRefs: SnapshotOrigemRef[];
  };
}

/** Plano de merge — hoje trivial (a lógica pesada está na reversão). */
export function planoDeMerge(): PlanoMerge {
  return { contatosComoSecundario: true };
}

function chaveDoc(d: SnapshotDocumento): string {
  return `${d.tipo}:${d.valor}`;
}
function chaveRef(r: SnapshotOrigemRef): string {
  return `${r.plataformaOrigem}:${r.tipoRef}:${r.valorRef}`;
}

/**
 * Plano de reversão de um `merge_pessoa`.
 *
 * @param snapshot   estado pré-merge das duas pessoas (do `merge_pessoa.snapshot`)
 * @param linhas     linhas filhas atualmente na sobrevivente com `origemMergeId === mergeId`
 */
export function planoDeReversao(
  snapshot: SnapshotMergePessoa,
  linhas: LinhaProvenienciada[],
): PlanoReversao {
  const moverParaAbsorvida: string[] = [];
  const divergencias: Divergencia[] = [];

  // índice das linhas vivas por (tabela, chave)
  const vivasPorChave = new Map<string, LinhaProvenienciada>();
  for (const l of linhas) vivasPorChave.set(`${l.tabela}:${l.chave}`, l);

  const consumidas = new Set<string>();

  const recriarNaAbsorvida: PlanoReversao['recriarNaAbsorvida'] = {
    emails: [],
    telefones: [],
    documentos: [],
    enderecos: [],
    origemRefs: [],
  };

  /**
   * @param curadoNoSnapshot se a linha já era `curado` quando a absorvida foi
   *   unificada. `curado` que já existia antes do merge **não** é divergência —
   *   volta normalmente. Só `curado` adquirido DEPOIS do merge (snapshot `false`,
   *   estado atual `true`) prevalece e vira `Divergencia` (Princípio VII).
   */
  const casa = (
    tabela: LinhaProvenienciada['tabela'],
    chave: string,
    campo: string,
    curadoNoSnapshot: boolean,
    quandoRecriar: () => void,
  ): void => {
    const k = `${tabela}:${chave}`;
    const viva = vivasPorChave.get(k);
    if (!viva) {
      quandoRecriar();
      return;
    }
    consumidas.add(k);
    if (viva.curado && !curadoNoSnapshot) {
      divergencias.push({
        campo,
        valorAtual: 'mantido na sobrevivente (curado)',
        valorSnapshot: chave,
        motivo: 'divergiu_pos_merge',
      });
    } else {
      moverParaAbsorvida.push(viva.id);
    }
  };

  for (const e of snapshot.absorvida.emails) {
    casa('email', e.valor, `email:${e.valor}`, e.curado, () =>
      recriarNaAbsorvida.emails.push(e),
    );
  }
  for (const t of snapshot.absorvida.telefones) {
    casa('telefone', t.valor, `telefone:${t.valor}`, t.curado, () =>
      recriarNaAbsorvida.telefones.push(t),
    );
  }
  for (const d of snapshot.absorvida.documentos) {
    casa('documento', chaveDoc(d), `documento:${chaveDoc(d)}`, d.curado, () =>
      recriarNaAbsorvida.documentos.push(d),
    );
  }
  for (const en of snapshot.absorvida.enderecos) {
    casa('endereco', en.logradouro, `endereco:${en.logradouro}`, en.curado, () =>
      recriarNaAbsorvida.enderecos.push(en),
    );
  }
  for (const r of snapshot.absorvida.origemRefs) {
    casa('origemRef', chaveRef(r), `origemRef:${chaveRef(r)}`, false, () =>
      recriarNaAbsorvida.origemRefs.push(r),
    );
  }

  return { moverParaAbsorvida, divergencias, recriarNaAbsorvida };
}
