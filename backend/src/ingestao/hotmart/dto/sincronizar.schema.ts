import { z } from 'zod';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JANELA_DIAS = 365;

/**
 * Corpo de `POST /ingestao/hotmart/sincronizar`. Janela obrigatória, ≤ 365 dias —
 * guarda de borda contra o `502` de query lenta da Hotmart (a doc não documenta
 * um teto rígido; ajustável).
 */
export const sincronizarHotmartSchema = z
  .object({
    conta: z.enum(['HOTMART_PRD', 'HOTMART_SVC']),
    dataInicio: z.string().regex(DATA_RE, 'use YYYY-MM-DD'),
    dataFinal: z.string().regex(DATA_RE, 'use YYYY-MM-DD'),
    /** CSV de status Hotmart (`APPROVED,REFUNDED,...`) repassado como `transaction_status`. */
    transactionStatus: z.string().min(1).optional(),
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

export type SincronizarHotmartDto = z.infer<typeof sincronizarHotmartSchema>;
