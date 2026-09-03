import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { z } from 'zod';
import { eventoCanonicoSchema, hashEvento } from '../domain';
import type { EntradaIngestao, ResultadoIngestao } from '../domain';
import { EventoRepository } from '../infra/evento.repository';

const entradaSchema = z
  .object({
    plataformaOrigem: z.nativeEnum(PlataformaOrigem),
    tipoOrigem: z.string().trim().min(1),
    idOrigem: z.string().trim().min(1),
    payloadBruto: z.unknown(),
    eventoCanonico: eventoCanonicoSchema.optional(),
  })
  .strict();

/**
 * Porta de ingestão (spec 006) — **ponto único de escrita da etapa 0**. Calcula o
 * `hash`, aplica a dedup `(plataforma_origem, id_origem, hash)`, persiste
 * imutável, cria as 7 `evento_etapa`, devolve `{ eventoId, criado }`. Idempotente.
 *
 * Exportada pelo `IngestaoModule`: é o que os adapters das specs 019–022 vão
 * injetar (in-process). O endpoint HTTP `POST /ingestao/eventos` é um invólucro
 * fino desta porta.
 */
@Injectable()
export class RegistrarEventoService {
  private readonly logger = new Logger(RegistrarEventoService.name);

  constructor(private readonly repo: EventoRepository) {}

  async registrarEvento(entrada: EntradaIngestao): Promise<ResultadoIngestao> {
    const parsed = entradaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'entrada de ingestão inválida',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    if (parsed.data.payloadBruto === undefined || parsed.data.payloadBruto === null) {
      throw new BadRequestException({ message: 'payloadBruto é obrigatório' });
    }

    let hash: string;
    try {
      hash = hashEvento(parsed.data.payloadBruto);
    } catch (err) {
      throw new BadRequestException({
        message: 'payloadBruto não é JSON-serializável',
        detalhes: [(err as Error).message],
      });
    }

    const { eventoId, criado } = await this.repo.upsertPorChave({
      plataformaOrigem: parsed.data.plataformaOrigem,
      idOrigem: parsed.data.idOrigem,
      tipoOrigem: parsed.data.tipoOrigem,
      payloadBruto: parsed.data.payloadBruto,
      eventoCanonico: entrada.eventoCanonico,
      hash,
    });

    this.logger.log(
      `ingestao.evento ${criado ? 'criado' : 'dedup'} id=${eventoId} conta=${parsed.data.plataformaOrigem} tipo=${parsed.data.tipoOrigem}`,
    );
    return { eventoId, criado };
  }
}
