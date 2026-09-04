import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { agoraUtc, uuidv7 } from '../../../core/core.module';
import { AtendimentoRepository, RespostaRepository } from '../../infra/atendimento';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';
import { EnvioWhatsappService } from '../whatsapp/envio-whatsapp.service';
import type { ResponderAtendimentoDto } from '../../dto/atendimento/atendimento.schema';

/**
 * `registrarResposta` (spec 012, FR-011..FR-013). Canal WHATSAPP delega ao
 * `EnvioWhatsappService` já existente da 011 (mesma validação de janela de
 * 24h/template — nenhuma regra nova). Canal MANUAL cria a `Interacao`
 * diretamente. Em ambos, grava `RespostaAtendimento` (quem respondeu, com/sem
 * IA) e marca `primeiraRespostaEm` na 1ª vez.
 */
@Injectable()
export class RespostaService {
  constructor(
    private readonly atendimentos: AtendimentoRepository,
    private readonly respostas: RespostaRepository,
    private readonly registrarInteracao: RegistrarInteracaoService,
    private readonly envioWhatsapp: EnvioWhatsappService,
  ) {}

  async registrarResposta(
    atendimentoId: string,
    dto: ResponderAtendimentoDto,
    autorId: string,
    req: Request,
  ) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');
    if (atendimento.status !== 'EM_ATENDIMENTO') {
      throw new ConflictException({ erro: 'atendimento_nao_esta_em_andamento' });
    }
    if (atendimento.atendenteAtualId !== autorId) {
      throw new ForbiddenException({ erro: 'nao_e_o_atendente_atual' });
    }

    let interacaoId: string;
    if (atendimento.canal === 'WHATSAPP' && atendimento.canalWhatsappId) {
      const resultado = await this.envioWhatsapp.enviar(
        {
          pessoaId: atendimento.pessoaId ?? undefined,
          leadId: atendimento.leadId ?? undefined,
          canalId: atendimento.canalWhatsappId,
          modo: 'LIVRE',
          texto: dto.conteudo,
        },
        req,
      );
      interacaoId = resultado.interacaoId;
    } else {
      const registro = await this.registrarInteracao.registrar(
        {
          pessoaId: atendimento.pessoaId ?? null,
          leadId: atendimento.leadId ?? null,
          tipo: 'TICKET',
          direcao: 'SAIDA',
          conteudo: dto.conteudo,
          autorId,
          ocorridoEm: agoraUtc().toISOString(),
        },
        { canalOrigem: `atendimento:manual:${atendimentoId}`, idExterno: uuidv7() },
      );
      interacaoId = registro.interacaoId;
    }

    // Tag da timeline sob o atendimento (D-01) — feito aqui (não dentro de
    // RegistrarInteracaoService/EnvioWhatsappService, que ficam agnósticos).
    await this.atendimentos.marcarInteracaoDoAtendimento(interacaoId, atendimentoId);

    const primeiraResposta = atendimento.primeiraRespostaEm == null;
    const respostaRow = await this.respostas.criar({
      atendimentoId,
      interacaoId,
      atendenteId: autorId,
      viaIa: dto.viaIa ?? false,
    });

    if (primeiraResposta) {
      await this.atendimentos.atualizar(atendimentoId, { primeiraRespostaEm: agoraUtc() });
    }

    return { interacaoId, respostaId: respostaRow.id, primeiraResposta };
  }
}
