import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { agoraUtc } from '../../../core/core.module';
import { csatElegivel, interpretarRespostaCsat } from '../../domain/atendimento';
import { AtendimentoRepository } from '../../infra/atendimento';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';
import type { RegistrarCsatDto } from '../../dto/atendimento/atendimento.schema';

/**
 * CSAT (spec 012, FR-014..FR-016/D-R5) — reaproveita `interacao` tipo `NPS`
 * (nenhuma tabela nova). `interpretarEntradaWebhook` é chamado pelo webhook
 * do WhatsApp (011, editado) antes do fluxo padrão de mensagem recebida.
 */
@Injectable()
export class CsatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly atendimentos: AtendimentoRepository,
    private readonly registrarInteracao: RegistrarInteracaoService,
  ) {}

  private async jaTemResposta(atendimentoId: string): Promise<boolean> {
    const r = await this.prisma.interacao.findFirst({
      where: { atendimentoId, tipo: 'NPS' },
      select: { id: true },
    });
    return r != null;
  }

  async registrarCsat(atendimentoId: string, dto: RegistrarCsatDto) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');

    const jaTem = await this.jaTemResposta(atendimentoId);
    const elegivel = csatElegivel(
      { status: atendimento.status, csatSolicitadoEm: atendimento.csatSolicitadoEm },
      jaTem,
    );
    if (!elegivel) {
      throw new ConflictException({
        erro: jaTem ? 'csat_ja_registrado' : 'nao_elegivel_para_csat',
      });
    }
    if (!Number.isInteger(dto.nota) || dto.nota < 0 || dto.nota > 10) {
      throw new UnprocessableEntityException({ erro: 'nota_invalida' });
    }

    const registro = await this.registrarInteracao.registrar(
      {
        pessoaId: atendimento.pessoaId ?? null,
        leadId: atendimento.leadId ?? null,
        tipo: 'NPS',
        notaNps: dto.nota,
        conteudo: dto.comentario ?? '(sem comentário)',
        ocorridoEm: agoraUtc().toISOString(),
      },
      { canalOrigem: `atendimento:csat:${atendimentoId}`, idExterno: atendimentoId },
    );
    await this.atendimentos.marcarInteracaoDoAtendimento(registro.interacaoId, atendimentoId);
    return { interacaoId: registro.interacaoId };
  }

  /**
   * Chamado pelo webhook do WhatsApp: devolve `true` se o texto recebido foi
   * interpretado e gravado como CSAT do atendimento encerrado mais recente
   * (elegível) da mesma âncora+canal; `false` se deve seguir o fluxo normal
   * de mensagem recebida.
   */
  async interpretarEntradaWebhook(
    ancora: { pessoaId?: string | null; leadId?: string | null },
    texto: string,
  ): Promise<boolean> {
    const nota = interpretarRespostaCsat(texto);
    if (nota == null) return false;

    const atendimento = await this.atendimentos.atendimentoEncerradoElegivelCsat(ancora, 'WHATSAPP');
    if (!atendimento) return false;

    const jaTem = await this.jaTemResposta(atendimento.id);
    if (!csatElegivel({ status: atendimento.status, csatSolicitadoEm: atendimento.csatSolicitadoEm }, jaTem)) {
      return false;
    }

    await this.registrarCsat(atendimento.id, { nota });
    return true;
  }
}
