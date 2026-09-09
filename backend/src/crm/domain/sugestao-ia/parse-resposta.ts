import { z } from 'zod';

/**
 * Interpretação da resposta bruta da IA (spec 013, FR-014, research.md D-R5)
 * — puro. Nunca confia no provedor devolver JSON perfeito: cada item é
 * validado individualmente; um item inválido é descartado (não derruba os
 * demais); se nada sobrar, devolve lista vazia + motivo — nunca lança.
 */

const sugestaoBrutaSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('RESPOSTA'),
    perguntaDetectada: z.string().trim().min(1),
    conteudoSugerido: z.string().trim().min(1),
    faqItemId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    tipo: z.literal('CAMPO_PERSONALIZADO'),
    perguntaDetectada: z.string().trim().min(1).nullable().optional(),
    conteudoSugerido: z.string().trim().min(1),
    campoPersonalizadoChave: z.string().trim().min(1),
  }),
]);

export interface SugestaoRespostaGerada {
  tipo: 'RESPOSTA';
  perguntaDetectada: string;
  conteudoSugerido: string;
  faqItemId: string | null;
}

export interface SugestaoCampoPersonalizadoGerada {
  tipo: 'CAMPO_PERSONALIZADO';
  perguntaDetectada: string | null;
  conteudoSugerido: string;
  campoPersonalizadoChave: string;
}

export type SugestaoGerada = SugestaoRespostaGerada | SugestaoCampoPersonalizadoGerada;

export interface ResultadoInterpretacao {
  sugestoes: SugestaoGerada[];
  /** Motivo textual — só informativo, quando `sugestoes` está vazia. */
  problema: string | null;
}

export function interpretarRespostaIa(bruto: string): ResultadoInterpretacao {
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return { sugestoes: [], problema: 'resposta_nao_e_json' };
  }

  if (!Array.isArray(json)) {
    return { sugestoes: [], problema: 'resposta_nao_e_lista' };
  }
  if (json.length === 0) {
    return { sugestoes: [], problema: null };
  }

  const sugestoes: SugestaoGerada[] = [];
  for (const item of json) {
    const resultado = sugestaoBrutaSchema.safeParse(item);
    if (!resultado.success) continue;

    const dado = resultado.data;
    sugestoes.push(
      dado.tipo === 'RESPOSTA'
        ? {
            tipo: 'RESPOSTA',
            perguntaDetectada: dado.perguntaDetectada,
            conteudoSugerido: dado.conteudoSugerido,
            faqItemId: dado.faqItemId ?? null,
          }
        : {
            tipo: 'CAMPO_PERSONALIZADO',
            perguntaDetectada: dado.perguntaDetectada ?? null,
            conteudoSugerido: dado.conteudoSugerido,
            campoPersonalizadoChave: dado.campoPersonalizadoChave,
          },
    );
  }

  if (sugestoes.length === 0) {
    return { sugestoes: [], problema: 'nenhum_item_valido' };
  }
  return { sugestoes, problema: null };
}
