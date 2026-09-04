import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { escolherAtendentePorCarga } from '../../domain/atendimento';
import { AtendimentoRepository, TransferenciaRepository } from '../../infra/atendimento';
import { EquipeRepository } from '../../infra/equipe.repository';
import type { TransferirAtendimentoDto } from '../../dto/atendimento/atendimento.schema';

/**
 * `transferir` (spec 012, FR-007..FR-009). Atendente específico → atribuição
 * direta, sem verificação de expediente/carga (transferência é ação
 * explícita, não uma nova rodada de endereçamento automático — edge case do
 * spec.md). Só equipe → reaplica `escolherAtendentePorCarga` restrito a ela.
 */
@Injectable()
export class TransferenciaService {
  constructor(
    private readonly atendimentos: AtendimentoRepository,
    private readonly transferencias: TransferenciaRepository,
    private readonly equipes: EquipeRepository,
  ) {}

  async transferir(atendimentoId: string, dto: TransferirAtendimentoDto, executadoPorId: string) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');
    if (atendimento.status === 'ENCERRADO') {
      throw new ConflictException({ erro: 'atendimento_encerrado' });
    }

    const deAtendenteId = atendimento.atendenteAtualId;
    const deEquipeId = atendimento.equipeId;

    let paraAtendenteId: string | null = dto.paraAtendenteId ?? null;
    const paraEquipeId: string | null = dto.paraEquipeId ?? deEquipeId;

    if (!paraAtendenteId && dto.paraEquipeId) {
      const membros = await this.equipes.membrosAtivos(dto.paraEquipeId);
      const cargas = await this.atendimentos.contarCargaPorUsuario(membros.map((m) => m.usuarioId));
      const candidatos = membros.map((m) => ({
        usuarioId: m.usuarioId,
        cargaAtual: cargas.get(m.usuarioId) ?? 0,
      }));
      paraAtendenteId = escolherAtendentePorCarga(candidatos);
    }

    const transferencia = await this.transferencias.criar({
      atendimentoId,
      deAtendenteId,
      paraAtendenteId,
      deEquipeId,
      paraEquipeId,
      transferidoPorId: executadoPorId,
      motivo: dto.motivo ?? null,
    });

    const atualizado = await this.atendimentos.atualizar(atendimentoId, {
      atendenteAtualId: paraAtendenteId,
      equipeId: paraEquipeId,
      status: paraAtendenteId ? 'EM_ATENDIMENTO' : 'AGUARDANDO',
    });

    return { transferenciaId: transferencia.id, atendimento: atualizado };
  }

  listarTransferencias(atendimentoId: string) {
    return this.transferencias.listarPorAtendimento(atendimentoId);
  }
}
