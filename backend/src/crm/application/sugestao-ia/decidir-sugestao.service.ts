import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  PORTA_CAMPO_PERSONALIZADO_PESSOA,
  type PortaCampoPersonalizadoPessoa,
} from '../../../core/core.module';
import { podeAvaliarUtilidade, podeDecidir } from '../../domain/sugestao-ia';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { AtendimentoRepository } from '../../infra/atendimento';
import { SugestaoIaRepository, type SugestaoIaRow } from '../../infra/sugestao-ia';
import { ValorCampoService } from '../lead/valor-campo.service';

function projetar(s: SugestaoIaRow) {
  return {
    id: s.id,
    atendimentoId: s.atendimentoId,
    tipo: s.tipo,
    perguntaDetectada: s.perguntaDetectada,
    faqItemId: s.faqItemId,
    campoPersonalizadoLeadId: s.campoPersonalizadoLeadId,
    campoPersonalizadoPessoaId: s.campoPersonalizadoPessoaId,
    conteudoSugerido: s.conteudoSugerido,
    conteudoFinal: s.conteudoFinal,
    status: s.status,
    decididoPorId: s.decididoPorId,
    decididoEm: s.decididoEm,
    util: s.util,
    criadoEm: s.criadoEm,
  };
}

/**
 * Decisão humana sobre uma `SugestaoIa` (spec 013, D-01/D-R6 — governança
 * 10.6, etapa 1). `RESPOSTA`: `aceitar` só marca a decisão, nunca envia
 * (envio é `POST /crm/atendimentos/:id/responder`, editado nesta spec).
 * `CAMPO_PERSONALIZADO`: `aceitar` grava o valor na mesma chamada — lead via
 * `ValorCampoService` (mesmo bounded context), pessoa via a porta
 * `PortaCampoPersonalizadoPessoa` (Princípio VI).
 */
@Injectable()
export class DecidirSugestaoService {
  constructor(
    private readonly repo: SugestaoIaRepository,
    private readonly atendimentos: AtendimentoRepository,
    private readonly valorCampoLead: ValorCampoService,
    @Inject(PORTA_CAMPO_PERSONALIZADO_PESSOA)
    private readonly valorCampoPessoa: PortaCampoPersonalizadoPessoa,
    private readonly rbac: SujeitoRbacService,
  ) {}

  private async exigirPendente(id: string): Promise<SugestaoIaRow> {
    const s = await this.repo.porId(id);
    if (!s) throw new NotFoundException('sugestão não encontrada');
    if (!podeDecidir(s.status)) {
      throw new ConflictException({ erro: 'sugestao_ja_decidida' });
    }
    return s;
  }

  async aceitar(id: string, conteudoFinal: string | undefined, autorId: string, req: Request) {
    const s = await this.exigirPendente(id);
    const conteudo = conteudoFinal ?? s.conteudoSugerido;

    if (s.tipo === 'CAMPO_PERSONALIZADO') {
      const atendimento = await this.atendimentos.porId(s.atendimentoId);
      if (!atendimento) throw new NotFoundException('atendimento não encontrado');

      const permissoes = await this.rbac.permissoesDe(req);
      if (s.campoPersonalizadoLeadId) {
        if (!permissoes.has('lead:editar')) throw new ForbiddenException('permissão insuficiente');
        await this.valorCampoLead.definirValor(
          atendimento.leadId!,
          s.campoPersonalizadoLeadId,
          conteudo,
          autorId,
        );
      } else if (s.campoPersonalizadoPessoaId) {
        if (!permissoes.has('pessoa:editar')) throw new ForbiddenException('permissão insuficiente');
        await this.valorCampoPessoa.definirValor(
          atendimento.pessoaId!,
          s.campoPersonalizadoPessoaId,
          conteudo,
          autorId,
        );
      }
    }

    const atualizada = await this.repo.marcarDecisao(id, {
      status: 'ACEITA',
      conteudoFinal: conteudo,
      decididoPorId: autorId,
    });
    return projetar(atualizada);
  }

  async rejeitar(id: string, autorId: string) {
    await this.exigirPendente(id);
    const atualizada = await this.repo.marcarDecisao(id, {
      status: 'REJEITADA',
      conteudoFinal: null,
      decididoPorId: autorId,
    });
    return projetar(atualizada);
  }

  async avaliarUtilidade(id: string, util: boolean, autorId: string) {
    const s = await this.repo.porId(id);
    if (!s) throw new NotFoundException('sugestão não encontrada');
    if (!podeAvaliarUtilidade(s.status)) {
      throw new ConflictException({ erro: 'sugestao_ainda_nao_decidida' });
    }
    const atualizada = await this.repo.marcarFeedback(id, util, autorId);
    return projetar(atualizada);
  }

  async listar(atendimentoId: string, interacaoId?: string) {
    const itens = await this.repo.listarPorAtendimento(atendimentoId, interacaoId);
    return { itens: itens.map(projetar) };
  }
}
