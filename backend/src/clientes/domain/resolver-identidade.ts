/**
 * Engine de identidade (spec 005, US1). **Função pura e determinística** — sem
 * I/O, sem efeito colateral, sem `Date.now`/`Math.random`. Recebe os candidatos
 * já materializados por quem chama.
 *
 * Regra de negócio inviolável #10: prioridade documento → CNPJ → e-mail → telefone;
 * critério que casa 2+ pessoas é **descartado** (nunca escolhe, nunca funde).
 */
import { normalizarChaves } from './normalizar';
import {
  CONFIANCA_POR_CRITERIO,
  type Criterio,
  type DadosIdentidade,
  type PessoaCandidata,
  type ResultadoIdentidade,
} from './tipos';

const ORDEM: Criterio[] = ['documento', 'cnpj', 'email', 'telefone'];

function listaDoCriterio(c: PessoaCandidata, criterio: Criterio): string[] {
  switch (criterio) {
    case 'documento':
      return c.documentos;
    case 'cnpj':
      return c.cnpjs;
    case 'email':
      return c.emails;
    case 'telefone':
      return c.telefones;
  }
}

/**
 * Resolve `mergedPara` até a raiz ativa. Protegido contra ciclo (retorna o id
 * corrente se a cadeia se fechar — não deve acontecer, mas a engine não trava).
 */
function raizAtiva(
  id: string,
  porId: Map<string, PessoaCandidata>,
  vistos: Set<string> = new Set(),
): string {
  let atual = id;
  while (true) {
    if (vistos.has(atual)) return atual;
    vistos.add(atual);
    const c = porId.get(atual);
    if (!c || c.mergedPara == null) return atual;
    atual = c.mergedPara;
  }
}

export function resolverIdentidade(
  dados: DadosIdentidade,
  candidatos: PessoaCandidata[],
): ResultadoIdentidade {
  const chaves = normalizarChaves({
    documento: dados.documento ?? null,
    email: dados.email ?? null,
    telefone: dados.telefone ?? null,
  });

  const porId = new Map(candidatos.map((c) => [c.id, c]));
  // acumula, por id resolvido, quais critérios casaram (para os `candidatos` do resultado)
  const criteriosPorId = new Map<string, Set<Criterio>>();

  for (const criterio of ORDEM) {
    const chave = chaves[criterio];
    if (!chave) continue;

    const idsResolvidos = new Set<string>();
    for (const c of candidatos) {
      if (listaDoCriterio(c, criterio).includes(chave)) {
        const raiz = raizAtiva(c.id, porId);
        idsResolvidos.add(raiz);
        if (!criteriosPorId.has(raiz)) criteriosPorId.set(raiz, new Set());
        criteriosPorId.get(raiz)!.add(criterio);
      }
    }

    if (idsResolvidos.size === 1) {
      const pessoaId = [...idsResolvidos][0];
      return {
        pessoaId,
        criterio,
        confianca: CONFIANCA_POR_CRITERIO[criterio],
        candidatos: [
          { id: pessoaId, criterios: [...criteriosPorId.get(pessoaId)!] },
        ],
      };
    }
    // size === 0 → tenta o próximo; size >= 2 → descarta o critério, tenta o próximo
  }

  return {
    pessoaId: null,
    criterio: null,
    confianca: null,
    candidatos: [...criteriosPorId.entries()].map(([id, cs]) => ({
      id,
      criterios: [...cs],
    })),
  };
}
