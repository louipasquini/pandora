import { Injectable, NotFoundException } from '@nestjs/common';
import { ContratoRepository } from '../infra/contrato.repository';
import { ContratoAuditService } from './contrato-audit.service';
import { ContratoQueryService } from './contrato-query.service';
import type { AjustarContratoDto } from '../dto/ajustar-contrato.schema';

/**
 * `PATCH /contratos/:id` (FR-008/FR-009) — o **único** endpoint de escrita do
 * contexto `contratos` (Princípio VIII). `toleranciaAtrasoDias`/`contratoAssinado`
 * são curados sem par derivado (nunca sobrescritos pelo fold);
 * `ajusteManualStatus` é o override temporário (CL-01) — quem o limpa é o
 * executor da etapa 6, nunca este serviço.
 */
@Injectable()
export class AjustarContratoService {
  constructor(
    private readonly repo: ContratoRepository,
    private readonly audit: ContratoAuditService,
    private readonly query: ContratoQueryService,
  ) {}

  async ajustar(id: string, autor: string, dto: AjustarContratoDto) {
    const atual = await this.repo.porId(id);
    if (!atual) throw new NotFoundException('contrato não encontrado');

    if (dto.toleranciaAtrasoDias !== undefined) {
      await this.audit.registrar({
        autor,
        entidadeId: id,
        campo: 'toleranciaAtrasoDias',
        valorAnterior: atual.toleranciaAtrasoDias,
        valorNovo: dto.toleranciaAtrasoDias,
        motivo: dto.motivo,
      });
    }
    if (dto.contratoAssinado !== undefined) {
      await this.audit.registrar({
        autor,
        entidadeId: id,
        campo: 'contratoAssinado',
        valorAnterior: atual.contratoAssinado,
        valorNovo: dto.contratoAssinado,
        motivo: dto.motivo,
      });
    }
    if (dto.ajusteManualStatus !== undefined) {
      await this.audit.registrar({
        autor,
        entidadeId: id,
        campo: 'ajusteManualStatus',
        valorAnterior: atual.ajusteManualStatus,
        valorNovo: dto.ajusteManualStatus,
        motivo: dto.motivo,
      });
    }

    await this.repo.aplicarAjusteManual(id, {
      toleranciaAtrasoDias: dto.toleranciaAtrasoDias,
      contratoAssinado: dto.contratoAssinado,
      ajusteManualStatus: dto.ajusteManualStatus,
      autor,
      motivo: dto.motivo,
    });

    return this.query.detalhe(id);
  }
}
