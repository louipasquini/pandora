import { Injectable, Logger } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { validarAncora } from '../../domain/interacao/ancora';
import { validarCamposPorTipo } from '../../domain/interacao/validar-campos-tipo';
import type {
  ChaveOrigemInteracao,
  InteracaoDirecao,
  InteracaoTipo,
} from '../../domain/interacao/tipos';
import { InteracaoRepository } from '../../infra/interacao/interacao.repository';
import { projetarInteracao } from './interacao.service';
import { CrmInteracaoAuditService } from './crm-interacao-audit.service';

export interface RegistrarInteracaoEntrada {
  pessoaId?: string | null;
  leadId?: string | null;
  tipo: InteracaoTipo;
  direcao?: InteracaoDirecao | null;
  conteudo: string;
  notaNps?: number | null;
  autorId?: string | null;
  ocorridoEm?: string | null;
}

/**
 * Porta **in-process** para as specs 011 (WhatsApp) e 012 (chat ao vivo)
 * injetarem. Idempotente por `(canal_origem, id_externo)` — índice único
 * parcial em `interacao`. Reentrada com a mesma chave devolve a interação
 * existente (`criada: false`), sem duplicar. **Sem endpoint HTTP** nesta spec.
 */
@Injectable()
export class RegistrarInteracaoService {
  private readonly logger = new Logger(RegistrarInteracaoService.name);

  constructor(
    private readonly repo: InteracaoRepository,
    private readonly audit: CrmInteracaoAuditService,
  ) {}

  async registrar(
    entrada: RegistrarInteracaoEntrada,
    chave: ChaveOrigemInteracao,
  ): Promise<{ interacaoId: string; criada: boolean; interacao: ReturnType<typeof projetarInteracao> }> {
    const existente = await this.repo.porChaveOrigem(chave.canalOrigem, chave.idExterno);
    if (existente) {
      return { interacaoId: existente.id, criada: false, interacao: projetarInteracao(existente) };
    }

    const ancora = validarAncora({ pessoaId: entrada.pessoaId, leadId: entrada.leadId });
    if (!ancora.ok) throw new Error(`âncora inválida: ${ancora.erro}`);
    const campos = validarCamposPorTipo({
      tipo: entrada.tipo,
      direcao: entrada.direcao ?? null,
      notaNps: entrada.notaNps ?? null,
    });
    if (!campos.ok) throw new Error(campos.erro);

    const row = await this.repo.criar({
      pessoaId: ancora.tipo === 'pessoa' ? ancora.id : null,
      leadId: ancora.tipo === 'lead' ? ancora.id : null,
      tipo: entrada.tipo,
      direcao: entrada.direcao ?? null,
      conteudo: entrada.conteudo,
      notaNps: entrada.notaNps ?? null,
      autorId: entrada.autorId ?? null,
      canalOrigem: chave.canalOrigem,
      idExterno: chave.idExterno,
      ocorridoEm: entrada.ocorridoEm ? new Date(entrada.ocorridoEm) : agoraUtc(),
    });
    await this.audit.registrar({
      autor: chave.canalOrigem,
      entidade: 'interacao',
      entidadeId: row.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { canalOrigem: row.canalOrigem, idExterno: row.idExterno, tipo: row.tipo },
      motivo: 'registrar_integracao',
    });
    this.logger.log(
      `interacao.registrada canal_origem=${chave.canalOrigem} id_externo=${chave.idExterno}`,
    );
    return { interacaoId: row.id, criada: true, interacao: projetarInteracao(row) };
  }
}
