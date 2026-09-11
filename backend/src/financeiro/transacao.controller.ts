import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UnprocessableEntityException,
  Query,
} from '@nestjs/common';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { TentarVincularService } from './application/tentar-vincular.service';
import { TransacaoQueryService } from './application/transacao-query.service';
import { listarTransacoesSchema } from './dto/listar-transacoes.schema';

/**
 * `/financeiro/transacoes` (spec 018 + retry de vínculo da spec 024). `transacao`
 * segue escrita **só** pelo pipeline de ingestão (Princípio VIII) — as 2 rotas de
 * escrita aqui não criam/editam transação nenhuma: só forçam uma nova tentativa
 * de casar um vínculo Asaas↔Guru já modelado pela etapa 4, reusando a mesma
 * lógica de domínio (`TentarVincularService`). Leitura sob `transacao:ver`;
 * retry sob `transacao:vincular`. 401 (sem token) ≠ 403 (sem permissão).
 */
@Controller('financeiro/transacoes')
export class TransacaoController {
  constructor(
    private readonly query: TransacaoQueryService,
    private readonly tentarVincular: TentarVincularService,
  ) {}

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

  @RequerPermissao('transacao:vincular')
  @Post('tentar-vincular-pendentes')
  @HttpCode(200)
  async tentarVincularPendentes() {
    return this.tentarVincular.tentarPendentes();
  }

  @RequerPermissao('transacao:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.query.detalhe(id);
  }

  @RequerPermissao('transacao:vincular')
  @Post(':id/tentar-vincular')
  @HttpCode(200)
  async tentarVincularUma(@Param('id') id: string) {
    const r = await this.tentarVincular.tentar(id);
    if (r.motivo === 'sem_referencia_externa') {
      throw new UnprocessableEntityException({
        erro: 'transacao_nao_terceirizada',
        mensagem: 'transação Asaas sem referência externa — nunca é terceirizada',
      });
    }
    return r;
  }
}
