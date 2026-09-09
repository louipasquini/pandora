import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { DisparoService, WorkerService } from './application/disparos';
import {
  criarDisparoSchema,
  listarDestinatariosSchema,
  listarDisparosSchema,
} from './dto/disparos/criar-disparo.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({
      message: 'entrada inválida',
      detalhes: r.error.issues.map((i) => `${i.path.join('.') || '_'}: ${i.message}`),
    });
  }
  return r.data;
}

/**
 * Disparos de WhatsApp em massa (spec 015). Leitura sob `disparo:ver`;
 * criar/importar CSV sob `disparo:criar`; cancelar sob `disparo:cancelar`.
 */
@Controller('crm/disparos')
export class DisparoController {
  constructor(
    private readonly disparos: DisparoService,
    private readonly worker: WorkerService,
  ) {}

  @RequerPermissao('disparo:criar')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.disparos.criar(parse(criarDisparoSchema, body), autor(req));
  }

  @RequerPermissao('disparo:ver')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    return this.disparos.listar(parse(listarDisparosSchema, q));
  }

  @RequerPermissao('disparo:ver')
  @Get(':id')
  obter(@Param('id') id: string) {
    return this.disparos.obter(id);
  }

  @RequerPermissao('disparo:ver')
  @Get(':id/destinatarios')
  listarDestinatarios(@Param('id') id: string, @Query() q: Record<string, unknown>) {
    return this.disparos.listarDestinatarios(id, parse(listarDestinatariosSchema, q));
  }

  @RequerPermissao('disparo:ver')
  @Get(':id/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportar(@Param('id') id: string) {
    return this.disparos.exportarCsv(id);
  }

  @RequerPermissao('disparo:cancelar')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id') id: string, @Req() req: Request) {
    return this.disparos.cancelar(id, autor(req));
  }

  @RequerPermissao('disparo:criar')
  @Post('processar')
  @HttpCode(200)
  processar() {
    return this.worker.processarPassada();
  }
}
