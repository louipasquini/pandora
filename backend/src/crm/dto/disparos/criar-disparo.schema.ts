import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Corpo JSON de `POST /crm/disparos` — `csvConteudo` é o texto bruto do CSV,
 * já lido no navegador via `FileReader.readAsText()` (research.md D-R6: sem
 * upload binário, 0 dependência nova de `multer`).
 */
export const criarDisparoSchema = z
  .object({
    nome: z.string().trim().min(1).max(160),
    canalId: uuid,
    templateId: uuid,
    templateBId: uuid.optional(),
    percentualVarianteB: z.coerce.number().int().min(0).max(100).optional(),
    segmentoId: uuid.optional(),
    csvConteudo: z.string().min(1).optional(),
    criarLead: z.boolean().default(false),
    agendadoPara: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  })
  .strict()
  .refine((v) => (v.templateBId === undefined) === (v.percentualVarianteB === undefined), {
    message: 'templateBId e percentualVarianteB devem vir juntos',
  });
export type CriarDisparoDto = z.infer<typeof criarDisparoSchema>;

export const listarDisparosSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(['AGENDADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'ERRO']).optional(),
    criadoDe: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    criadoAte: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  })
  .strict();
export type ListarDisparosDto = z.infer<typeof listarDisparosSchema>;

export const listarDestinatariosSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(['PENDENTE', 'ENVIANDO', 'ENVIADA', 'FALHOU', 'PULADA']).optional(),
  })
  .strict();
export type ListarDestinatariosDto = z.infer<typeof listarDestinatariosSchema>;
