import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { ContaService } from './application/conta.service';
import { MergeService } from './application/merge.service';
import {
  associarPessoaSchema,
  contaMergeBodySchema,
  criarContaSchema,
  patchContaSchema,
} from './dto/conta.schema';
import { listaQuerySchema } from './dto/pessoa.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

/** `/contas` (spec 005). `conta` NÃO referencia `contrato` (regra inviolável #3). */
@Controller('contas')
export class ContaController {
  constructor(
    private readonly contas: ContaService,
    private readonly merge: MergeService,
  ) {}

  @RequerPermissao('conta:ver')
  @Get()
  listar(@Query() query: Record<string, unknown>) {
    const parsed = listaQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('query inválida');
    return this.contas.listar(parsed.data);
  }

  @RequerPermissao('conta:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.contas.verDetalhe(id);
  }

  @RequerPermissao('conta:editar')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    const parsed = criarContaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    return this.contas.criar(parsed.data, autor(req));
  }

  @RequerPermissao('conta:editar')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = patchContaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    return this.contas.patch(id, parsed.data, autor(req));
  }

  @RequerPermissao('conta:editar')
  @Post(':id/pessoas')
  @HttpCode(200)
  associar(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = associarPessoaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    return this.contas.associar(id, parsed.data, autor(req));
  }

  @RequerPermissao('conta:editar')
  @Delete(':id/pessoas/:pessoaId')
  @HttpCode(204)
  async desassociar(
    @Param('id') id: string,
    @Param('pessoaId') pessoaId: string,
    @Req() req: Request,
  ) {
    await this.contas.desassociar(id, pessoaId, autor(req));
  }

  @RequerPermissao('conta:merge')
  @Post(':id/merge')
  @HttpCode(200)
  async mergeConta(
    @Param('id') sobreviventeId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = contaMergeBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    await this.merge.mergeConta(sobreviventeId, parsed.data.absorvidaId, autor(req));
    return this.contas.verDetalhe(sobreviventeId);
  }

  @RequerPermissao('conta:merge')
  @Post(':id/merge/:mergeId/desfazer')
  @HttpCode(200)
  async desfazerMergeConta(
    @Param('id') sobreviventeId: string,
    @Param('mergeId') mergeId: string,
    @Req() req: Request,
  ) {
    await this.merge.desfazerMergeConta(sobreviventeId, mergeId, autor(req));
    return this.contas.verDetalhe(sobreviventeId);
  }
}
