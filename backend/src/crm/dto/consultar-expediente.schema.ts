import { z } from 'zod';

export const consultarExpedienteSchema = z
  .object({
    instante: z.string().min(1).optional(),
    equipeId: z.string().uuid().optional(),
  })
  .strict();
export type ConsultarExpedienteDto = z.infer<typeof consultarExpedienteSchema>;
