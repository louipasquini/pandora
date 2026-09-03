import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { EventosQuery } from './application/eventos.query';
import { RegistrarEventoService } from './application/registrar-evento.service';
import { ReprocessarEventoService } from './application/reprocessar-evento.service';
import { WorkerService } from './application/worker.service';
import { ingerirEventoSchema } from './dto/ingerir-evento.schema';
import { listarEventosSchema } from './dto/listar-eventos.schema';
import { reprocessarSchema } from './dto/reprocessar.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

/**
 * `/ingestao/eventos` (spec 006). Ingestão sob `evento:ingerir`; leitura sob
 * `evento:ver`; reprocessar / rodar o worker sob `evento:reprocessar`. Nenhuma
 * rota pública — os webhooks por conta são das specs 019–022.
 */
@Controller('ingestao/eventos')
export class EventosController {
  constructor(
    private readonly registrar: RegistrarEventoService,
    private readonly reprocessarSvc: ReprocessarEventoService,
    private readonly worker: WorkerService,
    private readonly query: EventosQuery,
  ) {}

  @RequerPermissao('evento:ingerir')
  @Post()
  async ingerir(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = ingerirEventoSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const { eventoId, criado } = await this.registrar.registrarEvento({
      plataformaOrigem: parsed.data.plataformaOrigem,
      tipoOrigem: parsed.data.tipoOrigem,
      idOrigem: parsed.data.idOrigem,
      payloadBruto: parsed.data.payloadBruto,
      eventoCanonico: parsed.data.eventoCanonico,
    });
    res.status(criado ? 201 : 200);
    return { eventoId, criado };
  }

  @RequerPermissao('evento:reprocessar')
  @Post('processar')
  @HttpCode(200)
  processar() {
    return this.worker.processarPassada();
  }

  @RequerPermissao('evento:reprocessar')
  @Post(':id/reprocessar')
  @HttpCode(200)
  reprocessar(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = reprocessarSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    return this.reprocessarSvc.reprocessar(id, { forcar: parsed.data.forcar }, autor(req));
  }

  @RequerPermissao('evento:ver')
  @Get()
  listar(@Query() query: Record<string, unknown>) {
    const parsed = listarEventosSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('query inválida');
    return this.query.listar(parsed.data);
  }

  @RequerPermissao('evento:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.query.detalhe(id);
  }
}
