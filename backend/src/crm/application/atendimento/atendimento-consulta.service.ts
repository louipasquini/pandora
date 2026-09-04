import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { agoraUtc } from '../../../core/core.module';
import { calcularSlaAtendimento, ordenarFila } from '../../domain/atendimento';
import { AtendimentoRepository, type AtendimentoRow } from '../../infra/atendimento';
import type { ListarAtendimentosDto } from '../../dto/atendimento/atendimento.schema';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

export function projetarAtendimento(a: AtendimentoRow, agora: Date) {
  return {
    id: a.id,
    pessoaId: a.pessoaId,
    leadId: a.leadId,
    canal: a.canal,
    canalWhatsappId: a.canalWhatsappId,
    equipeId: a.equipeId,
    atendenteAtualId: a.atendenteAtualId,
    status: a.status,
    prioridade: a.prioridade,
    abertoEm: a.abertoEm,
    primeiraRespostaEm: a.primeiraRespostaEm,
    encerradoEm: a.encerradoEm,
    encerradoPorId: a.encerradoPorId,
    motivoEncerramento: a.motivoEncerramento,
    csatSolicitadoEm: a.csatSolicitadoEm,
    sla: calcularSlaAtendimento(
      {
        status: a.status,
        abertoEm: a.abertoEm,
        primeiraRespostaEm: a.primeiraRespostaEm,
        slaMinutos: a.slaMinutos,
      },
      agora,
    ),
  };
}

/**
 * Escopo de visão `atendimento:ver_todos`\|`ver_proprios` (spec 012, FR-019 —
 * mesmo padrão "OU" + filtro no `where` de `lead`/`oportunidade`, 008/010).
 * Projeta `sla` calculado (`calcularSlaAtendimento`) em toda leitura —
 * Princípio V, nunca uma coluna persistida.
 */
@Injectable()
export class AtendimentoConsultaService {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly rbac: SujeitoRbacService,
  ) {}

  async escopoDe(req: Request): Promise<Prisma.AtendimentoWhereInput> {
    const perms = await this.rbac.permissoesDe(req);
    if (perms.has('atendimento:ver_todos')) return {};
    if (perms.has('atendimento:ver_proprios')) {
      return { atendenteAtualId: sub(req) ?? '__sem_sujeito__' };
    }
    throw new ForbiddenException('permissão insuficiente');
  }

  async listar(dto: ListarAtendimentosDto, req: Request) {
    const escopo = await this.escopoDe(req);
    const and: Prisma.AtendimentoWhereInput[] = [escopo];
    and.push(
      AtendimentoRepository.filtro({
        status: dto.status ?? (['AGUARDANDO', 'EM_ATENDIMENTO'] as const),
        prioridade: dto.prioridade,
        equipeId: dto.equipeId,
      }),
    );
    if (dto.mine) and.push({ atendenteAtualId: sub(req) ?? '__sem_sujeito__' });

    const itens = await this.repo.listar({ AND: and });
    const agora = agoraUtc();
    return { itens: ordenarFila(itens.map((a) => projetarAtendimento(a, agora))) };
  }

  async obter(id: string, req: Request) {
    return projetarAtendimento(await this.exigirNoEscopo(id, req), agoraUtc());
  }

  /** Usado pelos serviços de escrita: garante que o sujeito enxerga o atendimento. */
  async exigirNoEscopo(id: string, req: Request): Promise<AtendimentoRow> {
    const escopo = await this.escopoDe(req);
    const itens = await this.repo.listar({ AND: [escopo, { id }] });
    if (itens.length === 0) throw new NotFoundException('atendimento não encontrado');
    return itens[0];
  }
}
