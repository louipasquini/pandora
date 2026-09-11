import { BadRequestException, Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { ProdutoService } from './application';
import { curarProdutoSchema, listarProdutosSchema } from './dto/curar-produto.schema';

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

const FORMATO_CODIGO_PRODUTO = /^[A-Za-z]{3}$/;

/**
 * Produtos do catálogo (spec 023) — leitura sob `produto:ver`, curadoria sob
 * `produto:editar`. Superfície mínima (Princípio VIII): `produto` só é escrito
 * por `PUT /produtos/:codigo` (upsert de curadoria) ou pela ingestão (etapa 5,
 * auto-criação) / import de CSV Hotmart.
 */
@Controller('produtos')
export class ProdutoController {
  constructor(private readonly produtos: ProdutoService) {}

  @RequerPermissao('produto:ver')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    return this.produtos.listar(parse(listarProdutosSchema, q));
  }

  @RequerPermissao('produto:ver')
  @Get(':codigo')
  buscar(@Param('codigo') codigo: string) {
    if (!FORMATO_CODIGO_PRODUTO.test(codigo)) {
      throw new BadRequestException('código de produto deve ter 3 letras');
    }
    return this.produtos.buscarPorCodigo(codigo);
  }

  @RequerPermissao('produto:editar')
  @Put(':codigo')
  curar(@Param('codigo') codigo: string, @Body() body: unknown, @Req() req: Request) {
    if (!FORMATO_CODIGO_PRODUTO.test(codigo)) {
      throw new BadRequestException('código de produto deve ter 3 letras');
    }
    return this.produtos.curar(codigo, parse(curarProdutoSchema, body), autor(req));
  }
}
