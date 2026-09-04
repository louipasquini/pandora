import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizarTelefone } from '../../domain/lead/normalizar-lead';
import { OptOutWhatsappRepository, type OptOutWhatsappRow } from '../../infra/whatsapp';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import type { RegistrarOptOutDto } from '../../dto/whatsapp/optout-whatsapp.schema';

export interface OptOutView {
  emOptOut: boolean;
  desde: Date | null;
}

@Injectable()
export class OptOutWhatsappService {
  constructor(
    private readonly repo: OptOutWhatsappRepository,
    private readonly prisma: PrismaService,
    private readonly audit: CrmAdminAuditService,
  ) {}

  private async resolverAncora(
    telefone: string,
  ): Promise<{ pessoaId: string | null; leadId: string | null }> {
    const pessoaTelefone = await this.prisma.pessoaTelefone.findFirst({
      where: { valor: telefone },
      select: { pessoaId: true },
    });
    if (pessoaTelefone) return { pessoaId: pessoaTelefone.pessoaId, leadId: null };
    const lead = await this.prisma.lead.findFirst({
      where: { telefone },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });
    return { pessoaId: null, leadId: lead?.id ?? null };
  }

  async ativoPorTelefone(telefoneBruto: string): Promise<OptOutWhatsappRow | null> {
    const norm = normalizarTelefone(telefoneBruto);
    if (norm.erro !== undefined) throw new UnprocessableEntityException(`telefone: ${norm.erro}`);
    const linha = await this.repo.maisRecentePorTelefone(norm.valor as string);
    return linha && linha.revertidoEm == null ? linha : null;
  }

  async consultar(telefoneBruto: string): Promise<OptOutView> {
    const ativo = await this.ativoPorTelefone(telefoneBruto);
    return { emOptOut: ativo != null, desde: ativo?.optadoEm ?? null };
  }

  async registrar(dto: RegistrarOptOutDto, autor: string): Promise<OptOutWhatsappRow> {
    const norm = normalizarTelefone(dto.telefone);
    if (norm.erro !== undefined) throw new UnprocessableEntityException(`telefone: ${norm.erro}`);
    const telefone = norm.valor as string;

    const existente = await this.repo.maisRecentePorTelefone(telefone);
    if (existente && existente.revertidoEm == null) return existente;

    const { pessoaId, leadId } =
      dto.pessoaId || dto.leadId
        ? { pessoaId: dto.pessoaId ?? null, leadId: dto.leadId ?? null }
        : await this.resolverAncora(telefone);

    const row = await this.repo.criar({
      telefone,
      pessoaId,
      leadId,
      origem: dto.origem,
      optadoEm: agoraUtc(),
    });

    await this.audit.registrar({
      autor,
      entidade: 'opt_out_whatsapp',
      entidadeId: row.id,
      campo: 'registrado',
      valorAnterior: null,
      valorNovo: { telefone, origem: dto.origem },
      motivo: 'opt-out registrado via POST /crm/whatsapp/optout',
    });

    return row;
  }

  async reverter(telefoneBruto: string, autor: string): Promise<OptOutWhatsappRow> {
    const ativo = await this.ativoPorTelefone(telefoneBruto);
    if (!ativo) throw new NotFoundException({ erro: 'sem_optout_ativo' });

    const row = await this.repo.reverter(ativo.id, agoraUtc());

    await this.audit.registrar({
      autor,
      entidade: 'opt_out_whatsapp',
      entidadeId: row.id,
      campo: 'revertido',
      valorAnterior: { revertidoEm: null },
      valorNovo: { revertidoEm: row.revertidoEm },
      motivo: 'opt-out revertido via POST /crm/whatsapp/optout/reverter',
    });

    return row;
  }
}
