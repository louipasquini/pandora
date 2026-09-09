import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  PORTA_CAMPO_PERSONALIZADO_PESSOA,
  type PortaCampoPersonalizadoPessoa,
} from '../../../core/core.module';
import { montarPrompt, interpretarRespostaIa, type SugestaoGerada } from '../../domain/sugestao-ia';
import { AtendimentoRepository } from '../../infra/atendimento';
import { InteracaoRepository } from '../../infra/interacao/interacao.repository';
import { FaqRepository } from '../../infra/faq';
import { CampoPersonalizadoRepository } from '../../infra/lead/campo-personalizado.repository';
import { SugestaoIaRepository, type NovaSugestao } from '../../infra/sugestao-ia';
import { SUGESTAO_IA_CLIENT, type SugestaoIaClient } from './sugestao-ia-client';

function projetar(s: {
  id: string;
  tipo: string;
  perguntaDetectada: string | null;
  faqItemId: string | null;
  campoPersonalizadoLeadId: string | null;
  campoPersonalizadoPessoaId: string | null;
  conteudoSugerido: string;
  status: string;
}) {
  return {
    id: s.id,
    tipo: s.tipo,
    perguntaDetectada: s.perguntaDetectada,
    faqItemId: s.faqItemId,
    campoPersonalizadoLeadId: s.campoPersonalizadoLeadId,
    campoPersonalizadoPessoaId: s.campoPersonalizadoPessoaId,
    conteudoSugerido: s.conteudoSugerido,
    status: s.status,
  };
}

/**
 * Gera sugestões de IA para uma mensagem de entrada de um atendimento (spec
 * 013, FR-003/FR-004/FR-006/FR-007/FR-013/FR-014). Síncrona, sob demanda
 * (research.md D-R2/D-04) — nunca acionada fora de um atendimento (D-03).
 */
@Injectable()
export class GerarSugestaoService {
  constructor(
    private readonly atendimentos: AtendimentoRepository,
    private readonly interacoes: InteracaoRepository,
    private readonly faq: FaqRepository,
    private readonly camposLead: CampoPersonalizadoRepository,
    @Inject(PORTA_CAMPO_PERSONALIZADO_PESSOA)
    private readonly camposPessoa: PortaCampoPersonalizadoPessoa,
    @Inject(SUGESTAO_IA_CLIENT) private readonly client: SugestaoIaClient,
    private readonly repo: SugestaoIaRepository,
  ) {}

  async gerar(atendimentoId: string, interacaoId: string) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');

    const interacao = await this.interacoes.porId(interacaoId);
    if (!interacao || interacao.atendimentoId !== atendimentoId || interacao.direcao !== 'ENTRADA') {
      throw new UnprocessableEntityException({ erro: 'interacao_invalida' });
    }

    const faqAtiva = await this.faq.listarAtivos();
    const defsLead = atendimento.leadId ? await this.camposLead.listarAtivas() : [];
    const defsPessoa = atendimento.pessoaId ? await this.camposPessoa.listarDefinicoesAtivas() : [];

    const prompt = montarPrompt(
      { texto: interacao.conteudo },
      faqAtiva.map((f) => ({ id: f.id, pergunta: f.pergunta, resposta: f.resposta })),
      [
        ...defsLead.map((d) => ({ chave: d.chave, rotulo: d.rotulo, tipo: d.tipo })),
        ...defsPessoa.map((d) => ({ chave: d.chave, rotulo: d.rotulo, tipo: d.tipo })),
      ],
    );

    const resultado = await this.client.gerarSugestoes(prompt);
    if (!resultado.ok) {
      return { itens: [], aviso: resultado.motivo };
    }

    const { sugestoes, problema } = interpretarRespostaIa(resultado.textoBruto);
    if (sugestoes.length === 0) {
      return { itens: [], aviso: problema };
    }

    const faqIds = new Set(faqAtiva.map((f) => f.id));
    const leadPorChave = new Map(defsLead.map((d) => [d.chave, d.id]));
    const pessoaPorChave = new Map(defsPessoa.map((d) => [d.chave, d.id]));

    const novos: NovaSugestao[] = [];
    for (const s of sugestoes) {
      const item = paraNovaSugestao(s, atendimentoId, interacaoId, faqIds, leadPorChave, pessoaPorChave);
      if (item) novos.push(item);
    }

    if (novos.length === 0) {
      return { itens: [], aviso: 'nenhuma_sugestao_aplicavel' };
    }

    await this.repo.substituirPendentesDaInteracao(interacaoId);
    const criadas = await this.repo.criarLote(novos);
    return { itens: criadas.map(projetar), aviso: null };
  }
}

function paraNovaSugestao(
  s: SugestaoGerada,
  atendimentoId: string,
  interacaoOrigemId: string,
  faqIds: ReadonlySet<string>,
  leadPorChave: ReadonlyMap<string, string>,
  pessoaPorChave: ReadonlyMap<string, string>,
): NovaSugestao | null {
  if (s.tipo === 'RESPOSTA') {
    return {
      atendimentoId,
      interacaoOrigemId,
      tipo: 'RESPOSTA',
      perguntaDetectada: s.perguntaDetectada,
      faqItemId: s.faqItemId && faqIds.has(s.faqItemId) ? s.faqItemId : null,
      campoPersonalizadoLeadId: null,
      campoPersonalizadoPessoaId: null,
      conteudoSugerido: s.conteudoSugerido,
    };
  }

  const leadId = leadPorChave.get(s.campoPersonalizadoChave) ?? null;
  const pessoaId = leadId ? null : pessoaPorChave.get(s.campoPersonalizadoChave) ?? null;
  if (!leadId && !pessoaId) return null;

  return {
    atendimentoId,
    interacaoOrigemId,
    tipo: 'CAMPO_PERSONALIZADO',
    perguntaDetectada: s.perguntaDetectada,
    faqItemId: null,
    campoPersonalizadoLeadId: leadId,
    campoPersonalizadoPessoaId: pessoaId,
    conteudoSugerido: s.conteudoSugerido,
  };
}
