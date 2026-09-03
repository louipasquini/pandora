import { z } from 'zod';

/** `"HH:MM"` (24h) → minutos desde 00:00. */
export function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function minParaHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'use "HH:MM" (00:00–24:00)')
  .refine((v) => hhmmParaMin(v) <= 24 * 60, 'máximo 24:00');

const diaSemana = z.coerce.number().int().min(0).max(6);

export const criarJanelaSchema = z
  .object({
    equipeId: z.string().uuid().nullable().optional(),
    diaSemana,
    horaInicio: hhmm,
    horaFim: hhmm,
    ativo: z.boolean().optional(),
  })
  .strict();
export type CriarJanelaDto = z.infer<typeof criarJanelaSchema>;

export const patchJanelaSchema = z
  .object({
    equipeId: z.string().uuid().nullable().optional(),
    diaSemana: diaSemana.optional(),
    horaInicio: hhmm.optional(),
    horaFim: hhmm.optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchJanelaDto = z.infer<typeof patchJanelaSchema>;

export const listarJanelasSchema = z
  .object({
    equipeId: z.string().uuid().optional(),
    incluirGlobais: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarJanelasDto = z.infer<typeof listarJanelasSchema>;
