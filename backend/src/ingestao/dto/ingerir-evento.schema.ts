import { PlataformaOrigem } from '@prisma/client';
import { z } from 'zod';
import { eventoCanonicoSchema } from '../domain';

/**
 * Corpo de `POST /ingestao/eventos`. `payloadBruto` é qualquer JSON; a
 * serializabilidade e a chave de dedup são conferidas na porta
 * (`RegistrarEventoService`).
 */
export const ingerirEventoSchema = z
  .object({
    plataformaOrigem: z.nativeEnum(PlataformaOrigem),
    tipoOrigem: z.string().trim().min(1).max(120),
    idOrigem: z.string().trim().min(1).max(200),
    payloadBruto: z.unknown(),
    eventoCanonico: eventoCanonicoSchema.optional(),
  })
  .strict();

export type IngerirEventoDto = z.infer<typeof ingerirEventoSchema>;
