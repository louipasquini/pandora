import { Classificacao, EventoOrigemStatus, PlataformaOrigem } from '@prisma/client';
import { z } from 'zod';

const STATUS = ['pendente', 'ok', 'erro', 'revisar'] as const;

/**
 * Query de `GET /ingestao/eventos`. `status` é CSV; ausência → _default_
 * `revisar,erro` (o motivo do painel existir); `status=todos` remove o filtro.
 */
export const listarEventosSchema = z
  .object({
    status: z
      .string()
      .optional()
      .transform((v): EventoOrigemStatus[] | undefined => {
        if (v === undefined || v.trim() === '') return ['erro', 'revisar'];
        if (v === 'todos') return undefined;
        const partes = v
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is (typeof STATUS)[number] =>
            (STATUS as readonly string[]).includes(s),
          );
        return partes.length > 0
          ? (partes as EventoOrigemStatus[])
          : ['erro', 'revisar'];
      }),
    plataformaOrigem: z.nativeEnum(PlataformaOrigem).optional(),
    tipoOrigem: z.string().optional(),
    classificacao: z.nativeEnum(Classificacao).optional(),
    recebidoDe: z.coerce.date().optional(),
    recebidoAte: z.coerce.date().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type ListarEventosDto = z.infer<typeof listarEventosSchema>;
