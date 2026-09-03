import { z } from 'zod';

const enderecoSchema = z
  .object({
    logradouro: z.string().min(1).max(200),
    numero: z.string().max(20).optional(),
    complemento: z.string().max(120).optional(),
    bairro: z.string().max(120).optional(),
    cidade: z.string().max(120).optional(),
    uf: z.string().length(2).optional(),
    cep: z.string().max(12).optional(),
    pais: z.string().max(2).optional(),
  })
  .strict();

export const criarPessoaSchema = z
  .object({
    nome: z.string().trim().min(1).max(160),
    tipo: z.enum(['FISICA', 'JURIDICA', 'DESCONHECIDO']).optional(),
    emails: z.array(z.string()).optional(),
    telefones: z.array(z.string()).optional(),
    documentos: z.array(z.string()).optional(),
    enderecos: z.array(enderecoSchema).optional(),
    contaId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.emails?.length ?? 0) +
        (v.telefones?.length ?? 0) +
        (v.documentos?.length ?? 0) >
      0,
    { message: 'informe ao menos um e-mail, telefone ou documento' },
  );
export type CriarPessoaDto = z.infer<typeof criarPessoaSchema>;

export const patchPessoaSchema = z
  .object({
    nome: z.string().trim().min(1).max(160).optional(),
    tipo: z.enum(['FISICA', 'JURIDICA', 'DESCONHECIDO']).optional(),
    adicionarEmails: z.array(z.string()).optional(),
    removerEmails: z.array(z.string()).optional(),
    emailPrimario: z.string().nullable().optional(),
    adicionarTelefones: z.array(z.string()).optional(),
    removerTelefones: z.array(z.string()).optional(),
    telefonePrimario: z.string().nullable().optional(),
    adicionarDocumentos: z.array(z.string()).optional(),
    removerDocumentos: z.array(z.string()).optional(),
    enderecos: z.array(enderecoSchema).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'informe ao menos um campo para editar',
  });
export type PatchPessoaDto = z.infer<typeof patchPessoaSchema>;

export const mergeBodySchema = z
  .object({ absorvidaId: z.string().uuid() })
  .strict();
export type MergeBodyDto = z.infer<typeof mergeBodySchema>;

export const listaQuerySchema = z.object({
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(100).default(25),
  incluirUnificadas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListaQueryDto = z.infer<typeof listaQuerySchema>;
