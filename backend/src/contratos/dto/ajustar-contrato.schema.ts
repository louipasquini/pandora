import { StatusContratoCanonico } from '@prisma/client';
import { z } from 'zod';

/**
 * Body de `PATCH /contratos/:id` (FR-008). `motivo` é **sempre** obrigatório
 * (Padrão Transversal "Auditoria"); pelo menos 1 dos 3 campos de dado precisa
 * estar presente — corpo "só motivo" é rejeitado (nada para ajustar).
 */
export const ajustarContratoSchema = z
  .object({
    toleranciaAtrasoDias: z.coerce.number().int().min(0).max(365).optional(),
    contratoAssinado: z.boolean().optional(),
    ajusteManualStatus: z.nativeEnum(StatusContratoCanonico).nullable().optional(),
    motivo: z.string().trim().min(1, 'motivo é obrigatório em todo ajuste manual'),
  })
  .strict()
  .refine(
    (v) =>
      v.toleranciaAtrasoDias !== undefined ||
      v.contratoAssinado !== undefined ||
      v.ajusteManualStatus !== undefined,
    { message: 'informe ao menos um campo para ajustar' },
  );

export type AjustarContratoDto = z.infer<typeof ajustarContratoSchema>;
