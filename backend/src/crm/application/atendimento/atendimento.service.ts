import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { AtendimentoRepository } from '../../infra/atendimento';
import { EquipeRepository } from '../../infra/equipe.repository';
import { AbrirAtendimentoService, type AbrirAtendimentoEntrada } from './abrir-atendimento.service';

/**
 * `assumir`/`criarManual`/`encerrar` (spec 012, FR-006/FR-014). Transferência
 * fica em `transferencia.service.ts`; resposta em `resposta.service.ts`; CSAT
 * em `csat.service.ts`.
 */
@Injectable()
export class AtendimentoService {
  constructor(
    private readonly atendimentos: AtendimentoRepository,
    private readonly equipes: EquipeRepository,
    private readonly abrir: AbrirAtendimentoService,
  ) {}

  /** Canal MANUAL (registro sem provedor externo — ligação, presencial). */
  async criarManual(entrada: Pick<AbrirAtendimentoEntrada, 'pessoaId' | 'leadId'>) {
    return this.abrir.abrirOuReaproveitar({ ...entrada, canal: 'MANUAL' });
  }

  async assumir(atendimentoId: string, usuarioId: string) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');
    if (atendimento.status !== 'AGUARDANDO') {
      throw new ConflictException({ erro: 'ja_assumido' });
    }

    let equipeId = atendimento.equipeId;
    if (equipeId == null) {
      const { itens } = await this.equipes.listar({
        tipo: 'ATENDIMENTO',
        ativo: true,
        usuarioId,
        pagina: 1,
        tamanho: 1,
      });
      equipeId = itens[0]?.id ?? null;
    }

    return this.atendimentos.atualizar(atendimentoId, {
      status: 'EM_ATENDIMENTO',
      atendenteAtualId: usuarioId,
      equipeId,
    });
  }

  async encerrar(atendimentoId: string, usuarioId: string, motivo: string | undefined) {
    const atendimento = await this.atendimentos.porId(atendimentoId);
    if (!atendimento) throw new NotFoundException('atendimento não encontrado');
    if (atendimento.status !== 'EM_ATENDIMENTO') {
      throw new ConflictException({ erro: 'atendimento_nao_esta_em_andamento' });
    }

    const agora = agoraUtc();
    return this.atendimentos.atualizar(atendimentoId, {
      status: 'ENCERRADO',
      encerradoEm: agora,
      encerradoPorId: usuarioId,
      motivoEncerramento: motivo ?? null,
      csatSolicitadoEm: agora,
    });
  }
}
