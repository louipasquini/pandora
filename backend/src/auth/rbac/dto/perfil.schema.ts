import { z } from 'zod';
import { PERMISSAO_IDS } from '../catalogo';

const permissaoDoCatalogo = z
  .string()
  .refine((v) => PERMISSAO_IDS.has(v), { message: 'permissão fora do catálogo' });

const listaDePermissoes = z
  .array(permissaoDoCatalogo)
  .transform((arr) => [...new Set(arr)]);

export const criarPerfilSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  permissoes: listaDePermissoes,
});
export type CriarPerfilDto = z.infer<typeof criarPerfilSchema>;

export const editarPerfilSchema = z
  .object({
    nome: z.string().trim().min(1).max(80).optional(),
    permissoes: listaDePermissoes.optional(),
  })
  .refine((v) => v.nome !== undefined || v.permissoes !== undefined, {
    message: 'informe nome e/ou permissoes',
  });
export type EditarPerfilDto = z.infer<typeof editarPerfilSchema>;
