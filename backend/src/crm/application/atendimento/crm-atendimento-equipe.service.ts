import { NotFoundException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EquipeRepository } from '../../infra/equipe.repository';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import type { ConfigurarEquipeAtendimentoDto } from '../../dto/atendimento/atendimento.schema';

/**
 * Configuração administrativa por equipe (SLA de 1ª resposta / mensagem fora
 * do expediente — spec 012, FR-021). Config de baixo volume — audita em
 * `crm_admin_audit` (reuso, mesmo perfil de `equipe`/`integracao`/`canal_
 * whatsapp`, já que `entidade: 'equipe'` já existe desde a 007).
 */
@Injectable()
export class CrmAtendimentoEquipeService {
  constructor(
    private readonly equipes: EquipeRepository,
    private readonly audit: CrmAdminAuditService,
  ) {}

  async obter(equipeId: string) {
    const equipe = await this.equipes.obter(equipeId);
    if (!equipe) throw new NotFoundException('equipe não encontrada');
    return {
      slaPrimeiraRespostaMinutos: equipe.slaPrimeiraRespostaMinutos,
      mensagemForaExpediente: equipe.mensagemForaExpediente,
    };
  }

  async configurar(equipeId: string, dto: ConfigurarEquipeAtendimentoDto, autor: string) {
    const equipe = await this.equipes.obter(equipeId);
    if (!equipe) throw new NotFoundException('equipe não encontrada');
    if (equipe.tipo !== 'ATENDIMENTO') {
      throw new UnprocessableEntityException({ erro: 'equipe_nao_e_de_atendimento' });
    }

    await this.equipes.atualizar(equipeId, {
      ...(dto.slaPrimeiraRespostaMinutos !== undefined
        ? { slaPrimeiraRespostaMinutos: dto.slaPrimeiraRespostaMinutos }
        : {}),
      ...(dto.mensagemForaExpediente !== undefined
        ? { mensagemForaExpediente: dto.mensagemForaExpediente }
        : {}),
    });

    if (dto.slaPrimeiraRespostaMinutos !== undefined) {
      await this.audit.registrar({
        autor,
        entidade: 'equipe',
        entidadeId: equipeId,
        campo: 'slaPrimeiraRespostaMinutos',
        valorAnterior: equipe.slaPrimeiraRespostaMinutos,
        valorNovo: dto.slaPrimeiraRespostaMinutos,
        motivo: 'atendimento configurado via PATCH /crm/admin/atendimento/equipes/{id}',
      });
    }
    if (dto.mensagemForaExpediente !== undefined) {
      await this.audit.registrar({
        autor,
        entidade: 'equipe',
        entidadeId: equipeId,
        campo: 'mensagemForaExpediente',
        valorAnterior: equipe.mensagemForaExpediente,
        valorNovo: dto.mensagemForaExpediente,
        motivo: 'atendimento configurado via PATCH /crm/admin/atendimento/equipes/{id}',
      });
    }

    return this.obter(equipeId);
  }
}
