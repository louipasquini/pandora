import { z } from 'zod';

const STATUS = ['AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADO'] as const;
const PRIORIDADE = ['NORMAL', 'ALTA', 'URGENTE'] as const;

export const criarAtendimentoManualSchema = z
  .object({
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
  })
  .strict();
export type CriarAtendimentoManualDto = z.infer<typeof criarAtendimentoManualSchema>;

export const listarAtendimentosSchema = z
  .object({
    status: z
      .string()
      .transform((v) => v.split(',').map((s) => s.trim()))
      .pipe(z.array(z.enum(STATUS)))
      .optional(),
    prioridade: z.enum(PRIORIDADE).optional(),
    equipeId: z.string().uuid().optional(),
    mine: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarAtendimentosDto = z.infer<typeof listarAtendimentosSchema>;

export const responderAtendimentoSchema = z
  .object({
    conteudo: z.string().trim().min(1).max(4096),
    viaIa: z.boolean().default(false),
  })
  .strict();
export type ResponderAtendimentoDto = z.infer<typeof responderAtendimentoSchema>;

export const transferirAtendimentoSchema = z
  .object({
    paraAtendenteId: z.string().uuid().optional(),
    paraEquipeId: z.string().uuid().optional(),
    motivo: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((v) => v.paraAtendenteId != null || v.paraEquipeId != null, {
    message: 'informe paraAtendenteId ou paraEquipeId',
  });
export type TransferirAtendimentoDto = z.infer<typeof transferirAtendimentoSchema>;

export const encerrarAtendimentoSchema = z
  .object({
    motivo: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type EncerrarAtendimentoDto = z.infer<typeof encerrarAtendimentoSchema>;

export const registrarCsatSchema = z
  .object({
    nota: z.number().int().min(0).max(10),
    comentario: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type RegistrarCsatDto = z.infer<typeof registrarCsatSchema>;

export const configurarEquipeAtendimentoSchema = z
  .object({
    slaPrimeiraRespostaMinutos: z.number().int().min(1).max(1440).nullable().optional(),
    mensagemForaExpediente: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type ConfigurarEquipeAtendimentoDto = z.infer<typeof configurarEquipeAtendimentoSchema>;
