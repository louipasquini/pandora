import {
  ConflictException,
  ForbiddenException,
  Injectable,
  MethodNotAllowedException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { agoraUtc } from '../../../core/core.module';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { validarAncora, validarCamposPorTipo, podeEditar } from '../../domain/interacao';
import type { CriarInteracaoDto, ListarInteracoesDto } from '../../dto/criar-interacao.schema';
import {
  InteracaoRepository,
  type InteracaoRow,
  type PaginacaoOpts,
} from '../../infra/interacao/interacao.repository';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { LeadConsultaService } from '../lead/lead-consulta.service';
import { CrmInteracaoAuditService } from './crm-interacao-audit.service';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

export function projetarInteracao(i: InteracaoRow) {
  return {
    id: i.id,
    pessoaId: i.pessoaId,
    leadId: i.leadId,
    tipo: i.tipo,
    direcao: i.direcao,
    conteudo: i.conteudo,
    notaNps: i.notaNps,
    autorId: i.autorId,
    canalOrigem: i.canalOrigem,
    idExterno: i.idExterno,
    ocorridoEm: i.ocorridoEm,
    editadoEm: i.editadoEm,
    removidoEm: i.removidoEm,
    criadoEm: i.criadoEm,
    atualizadoEm: i.atualizadoEm,
  };
}

function snapshot(i: InteracaoRow) {
  return { conteudo: i.conteudo, removidoEm: i.removidoEm };
}

function opcoesDeListagem(dto: ListarInteracoesDto): PaginacaoOpts {
  return {
    pagina: dto.pagina,
    tamanho: dto.tamanho,
    tipo: dto.tipo,
    desde: dto.desde ? new Date(dto.desde) : undefined,
    ate: dto.ate ? new Date(dto.ate) : undefined,
    incluirRemovidas: dto.incluirRemovidas,
  };
}

/**
 * Timeline de `interacao` (spec 009, US1/US2/US3). `criar` valida âncora (XOR)
 * + campos por tipo antes de tocar o banco; `editarNota`/`removerNota` só
 * aceitam `tipo = NOTA` (CL-05); a leitura por pessoa é a **união** (CL-01):
 * própria ∪ dos leads convertidos nela.
 */
@Injectable()
export class InteracaoService {
  constructor(
    private readonly repo: InteracaoRepository,
    private readonly leads: LeadRepository,
    private readonly leadConsulta: LeadConsultaService,
    private readonly rbac: SujeitoRbacService,
    private readonly audit: CrmInteracaoAuditService,
  ) {}

  async criar(dto: CriarInteracaoDto, req: Request) {
    const ancora = validarAncora({ pessoaId: dto.pessoaId, leadId: dto.leadId });
    if (!ancora.ok) {
      throw new UnprocessableEntityException(
        ancora.erro === 'ambos'
          ? 'informe pessoaId OU leadId, nunca os dois'
          : 'informe pessoaId ou leadId',
      );
    }
    const campos = validarCamposPorTipo({
      tipo: dto.tipo,
      direcao: dto.direcao ?? null,
      notaNps: dto.notaNps ?? null,
    });
    if (!campos.ok) throw new UnprocessableEntityException(campos.erro);

    if (ancora.tipo === 'pessoa') {
      if (!(await this.repo.pessoaExiste(ancora.id))) {
        throw new NotFoundException('pessoa não encontrada');
      }
    } else {
      if (!(await this.leads.porId(ancora.id))) {
        throw new NotFoundException('lead não encontrado');
      }
    }

    const autorId = sub(req);
    const ocorridoEm = dto.ocorridoEm ? new Date(dto.ocorridoEm) : agoraUtc();
    const row = await this.repo.criar({
      pessoaId: ancora.tipo === 'pessoa' ? ancora.id : null,
      leadId: ancora.tipo === 'lead' ? ancora.id : null,
      tipo: dto.tipo,
      direcao: dto.direcao ?? null,
      conteudo: dto.conteudo,
      notaNps: dto.notaNps ?? null,
      autorId: autorId ?? null,
      canalOrigem: dto.canalOrigem ?? null,
      idExterno: dto.idExterno ?? null,
      ocorridoEm,
    });

    await this.audit.registrar({
      autor: autorId ?? 'desconhecido',
      entidade: 'interacao',
      entidadeId: row.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: projetarInteracao(row),
      motivo: 'criar',
    });
    return projetarInteracao(row);
  }

  async listarPorPessoa(pessoaId: string, dto: ListarInteracoesDto) {
    if (!(await this.repo.pessoaExiste(pessoaId))) {
      throw new NotFoundException('pessoa não encontrada');
    }
    const { itens, total } = await this.repo.listarPorPessoa(pessoaId, opcoesDeListagem(dto));
    return {
      itens: itens.map(projetarInteracao),
      pagina: dto.pagina,
      tamanho: dto.tamanho,
      total,
    };
  }

  async listarPorLead(leadId: string, dto: ListarInteracoesDto, req: Request) {
    await this.leadConsulta.exigirNoEscopo(leadId, req);
    const { itens, total } = await this.repo.listarPorLead(leadId, opcoesDeListagem(dto));
    return {
      itens: itens.map(projetarInteracao),
      pagina: dto.pagina,
      tamanho: dto.tamanho,
      total,
    };
  }

  /**
   * Confirma o escopo pela âncora — `GET /crm/interacoes/:id` é
   * `@AutenticadoBasta()`, então aqui é onde a regra de fato mora: lead usa o
   * escopo `lead:ver_*` da 008; pessoa exige `pessoa:ver`.
   */
  async obterPorId(id: string, req: Request): Promise<InteracaoRow> {
    const row = await this.repo.porId(id);
    if (!row) throw new NotFoundException('interação não encontrada');
    if (row.leadId) {
      await this.leadConsulta.exigirNoEscopo(row.leadId, req);
    } else {
      const perms = await this.rbac.permissoesDe(req);
      if (!perms.has('pessoa:ver')) throw new ForbiddenException('permissão insuficiente');
    }
    return row;
  }

  private async sujeitoMutabilidade(req: Request) {
    const perms = await this.rbac.permissoesDe(req);
    return { id: sub(req), temInteracaoGerir: perms.has('interacao:gerir') };
  }

  async editarNota(id: string, conteudo: string, req: Request) {
    const row = await this.obterPorId(id, req);
    const sujeito = await this.sujeitoMutabilidade(req);
    const permissao = podeEditar(
      { tipo: row.tipo, autorId: row.autorId, removidoEm: row.removidoEm },
      sujeito,
    );
    if (!permissao.ok) throw erroDeMutabilidade(permissao.erro);

    const antes = snapshot(row);
    const atualizado = await this.repo.editarNota(id, conteudo, agoraUtc());
    await this.audit.registrar({
      autor: sujeito.id ?? 'desconhecido',
      entidade: 'interacao',
      entidadeId: id,
      campo: 'conteudo',
      valorAnterior: antes,
      valorNovo: snapshot(atualizado),
      motivo: 'editar_nota',
    });
    return projetarInteracao(atualizado);
  }

  async removerNota(id: string, req: Request) {
    const row = await this.obterPorId(id, req);
    const sujeito = await this.sujeitoMutabilidade(req);
    const permissao = podeEditar(
      { tipo: row.tipo, autorId: row.autorId, removidoEm: row.removidoEm },
      sujeito,
    );
    if (!permissao.ok) throw erroDeMutabilidade(permissao.erro);

    const antes = snapshot(row);
    const atualizado = await this.repo.removerNota(id, agoraUtc());
    await this.audit.registrar({
      autor: sujeito.id ?? 'desconhecido',
      entidade: 'interacao',
      entidadeId: id,
      campo: 'removido_em',
      valorAnterior: antes,
      valorNovo: snapshot(atualizado),
      motivo: 'remover_nota',
    });
    return projetarInteracao(atualizado);
  }
}

function erroDeMutabilidade(erro: 'tipo_nao_editavel' | 'ja_removida' | 'sem_permissao') {
  if (erro === 'sem_permissao') return new ForbiddenException('permissão insuficiente');
  if (erro === 'ja_removida') return new ConflictException('nota já removida');
  return new MethodNotAllowedException('só interações do tipo NOTA são editáveis/removíveis');
}
