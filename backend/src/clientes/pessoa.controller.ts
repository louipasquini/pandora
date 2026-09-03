import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { PessoaService } from './application/pessoa.service';
import { MergeService } from './application/merge.service';
import {
  criarPessoaSchema,
  listaQuerySchema,
  mergeBodySchema,
  patchPessoaSchema,
} from './dto/pessoa.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

/**
 * `/pessoas` (spec 005). Leitura sob `pessoa:ver`; escrita sob `pessoa:editar`;
 * merge/desfazer sob `pessoa:merge`. Sem `DELETE` (exclusão = pseudonimização,
 * spec 047). Nenhuma rota pública.
 */
@Controller('pessoas')
export class PessoaController {
  constructor(
    private readonly pessoas: PessoaService,
    private readonly merge: MergeService,
  ) {}

  @RequerPermissao('pessoa:ver')
  @Get()
  listar(@Query() query: Record<string, unknown>) {
    const parsed = listaQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('query inválida');
    return this.pessoas.listar(parsed.data);
  }

  @RequerPermissao('pessoa:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.pessoas.verDetalhe(id);
  }

  @RequerPermissao('pessoa:editar')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    const parsed = criarPessoaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => i.message),
      });
    }
    return this.pessoas.criar(parsed.data, autor(req));
  }

  @RequerPermissao('pessoa:editar')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = patchPessoaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => i.message),
      });
    }
    return this.pessoas.patch(id, parsed.data, autor(req));
  }

  @RequerPermissao('pessoa:merge')
  @Post(':id/merge')
  @HttpCode(200)
  async mergePessoa(
    @Param('id') sobreviventeId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = mergeBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('corpo inválido');
    await this.merge.mergePessoa(sobreviventeId, parsed.data.absorvidaId, autor(req));
    return this.pessoas.verDetalhe(sobreviventeId);
  }

  @RequerPermissao('pessoa:merge')
  @Post(':id/merge/:mergeId/desfazer')
  @HttpCode(200)
  async desfazerMerge(
    @Param('id') sobreviventeId: string,
    @Param('mergeId') mergeId: string,
    @Req() req: Request,
  ) {
    const { notas } = await this.merge.desfazerMergePessoa(
      sobreviventeId,
      mergeId,
      autor(req),
    );
    const sobrevivente = await this.pessoas.verDetalhe(sobreviventeId);
    return { sobrevivente, notas };
  }
}
