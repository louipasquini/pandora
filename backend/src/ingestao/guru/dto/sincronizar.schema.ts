import { z } from 'zod';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JANELA_DIAS = 180;

/** Corpo de `POST /ingestao/guru/sincronizar`. Janela obrigatória, ≤ 180 dias (limite da API v2). */
export const sincronizarGuruSchema = z
  .object({
    conta: z.enum(['GURU_PRD', 'GURU_SVC']),
    dataInicio: z.string().regex(DATA_RE, 'use YYYY-MM-DD'),
    dataFinal: z.string().regex(DATA_RE, 'use YYYY-MM-DD'),
    campoData: z
      .enum(['ordered_at', 'confirmed_at', 'cancelled_at'])
      .default('ordered_at'),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ini = Date.parse(`${v.dataInicio}T00:00:00Z`);
    const fim = Date.parse(`${v.dataFinal}T00:00:00Z`);
    if (Number.isNaN(ini) || Number.isNaN(fim)) return;
    if (fim < ini) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataFinal'],
        message: 'dataFinal anterior a dataInicio',
      });
      return;
    }
    const dias = (fim - ini) / 86_400_000;
    if (dias > MAX_JANELA_DIAS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataFinal'],
        message: `janela acima de ${MAX_JANELA_DIAS} dias (${Math.round(dias)}d)`,
      });
    }
  });

export type SincronizarGuruDto = z.infer<typeof sincronizarGuruSchema>;
