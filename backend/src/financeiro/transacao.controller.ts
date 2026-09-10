import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { TransacaoQueryService } from './application/transacao-query.service';
import { listarTransacoesSchema } from './dto/listar-transacoes.schema';

/**
 * `/financeiro/transacoes` (spec 018). **Leitura-só** — `transacao` é escrita
 * apenas pelo pipeline de ingestão (Princípio VIII). Ambas as rotas sob
 * `transacao:ver`; 401 (sem token) ≠ 403 (sem permissão).
 */
@Controller('financeiro/transacoes')
export class TransacaoController {
  constructor(private readonly query: TransacaoQueryService) {}

  @RequerPermissao('transacao:ver')
  @Get()
  listar(@Query() query: Record<string, unknown>) {
    const parsed = listarTransacoesSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'query inválida',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.query.listar(parsed.data);
  }

  @RequerPermissao('transacao:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.query.detalhe(id);
  }
}
