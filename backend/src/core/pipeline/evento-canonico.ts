// `PlataformaOrigem`/`Classificacao` são enums de domínio congelados que moram no
// schema Prisma (grafia idêntica à de `core/plataforma-origem.enum.ts`). O tipo
// gerado é uma união de strings — compatível com `z.nativeEnum` e com literais.
import { Classificacao, PlataformaOrigem } from '@prisma/client';
import { z } from 'zod';
import { ehMoeda } from '../dinheiro/moeda';

/**
 * Contrato `EventoCanonico` (spec 006, **movido para `core/pipeline/` na spec 018**).
 * Forma canônica **validada** que um adapter de borda (specs 019–022) produz de um
 * `payload_bruto`. É lido pelo `ingestao` (etapa 0/1 — `classificar`) **e** pelo
 * `financeiro` (etapa 2/3 — `resolver pessoa` / `upsert transação`), por isso vive
 * no `core` (a fronteira do Princípio VI proíbe `financeiro` de importar
 * `ingestao/domain`). `ingestao/domain/evento-canonico.ts` re-exporta este arquivo.
 * Ver `specs/006-evento-origem-worker/contracts/evento-canonico.md` e
 * `specs/018-financeiro-transacao-ledger/contracts/pipeline-executor.md`.
 *
 * Núcleo obrigatório + opcionais transportados p/ as etapas 2–6.
 */

/** `Dinheiro` do core: inteiro (escala ×10000) + moeda ISO 4217. Aceita bigint,
 *  number inteiro ou string numérica (HTTP não carrega bigint) e normaliza p/ bigint. */
const dinheiroSchema = z
  .object({
    valorInteiro: z
      .union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)])
      .transform((v) => BigInt(v)),
    moeda: z.string().refine(ehMoeda, { message: 'moeda ISO 4217 inválida' }),
  })
  .strict();

const enderecoSchema = z
  .object({
    logradouro: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
    bairro: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
    cep: z.string().optional(),
    pais: z.string().optional(),
  })
  .strict();

export const eventoCanonicoSchema = z
  .object({
    // --- núcleo obrigatório ---
    plataformaOrigem: z.nativeEnum(PlataformaOrigem),
    idOrigem: z.string().min(1),
    tipoOrigem: z.string().min(1),
    /** status de origem CRU — a tradução p/ StatusTransacaoCanonico é dos adapters. */
    statusOrigem: z.string(),
    /** instante do fato; `parseInstante` é aplicado a jusante (spec 018) — aqui só string. */
    ocorridoEm: z.string(),

    // --- opcionais (validados se presentes; transportados) ---
    comprador: z
      .object({
        nome: z.string().optional(),
        emails: z.array(z.string()).optional(),
        telefones: z.array(z.string()).optional(),
        documentos: z.array(z.string()).optional(),
        endereco: enderecoSchema.optional(),
      })
      .strict()
      .optional(),
    valores: z
      .object({
        bruto: dinheiroSchema.optional(),
        liquido: dinheiroSchema.optional(),
        taxas: dinheiroSchema.optional(),
        reembolso: dinheiroSchema.optional(),
      })
      .strict()
      .optional(),
    oferta: z
      .object({
        codigoOrigem: z.string().optional(),
        nomeOrigem: z.string().optional(),
        quantidade: z.number().int().optional(),
      })
      .strict()
      .optional(),
    assinatura: z
      .object({
        ehRecorrencia: z.boolean().optional(),
        ciclo: z.string().optional(),
        numeroCiclo: z.number().int().optional(),
      })
      .strict()
      .optional(),
    ehAfiliada: z.boolean().optional(),
    referenciaExterna: z
      .object({
        plataforma: z.nativeEnum(PlataformaOrigem).optional(),
        idOrigem: z.string().optional(),
      })
      .strict()
      .optional(),
    classificacao: z.nativeEnum(Classificacao).optional(),
  })
  .strict();

export type EventoCanonico = z.infer<typeof eventoCanonicoSchema>;
