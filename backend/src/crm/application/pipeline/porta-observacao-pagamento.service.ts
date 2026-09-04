import { Injectable } from '@nestjs/common';
import { OportunidadeRepository } from '../../infra/pipeline/oportunidade.repository';
import { MovimentacaoRepository } from '../../infra/pipeline/movimentacao.repository';

/**
 * Porta in-process exportada do `CrmModule` (spec 010, D-02/FR-023). O
 * Financeiro (specs 018–030) ainda não existe — esta spec entrega só o
 * **efeito** (mover oportunidade `ABERTA` para a 1ª etapa `GANHA` do
 * respectivo pipeline), não o gatilho real. **Nunca** cria, edita ou lê
 * Contrato (regra 8.2.3 da visão) — a tabela nem existe ainda.
 */
export interface PortaObservacaoPagamentoCrm {
  observarPagamentoConfirmado(input: { pessoaId: string }): Promise<void>;
}

export const PORTA_OBSERVACAO_PAGAMENTO_CRM = Symbol('PortaObservacaoPagamentoCrm');

@Injectable()
export class PortaObservacaoPagamentoService implements PortaObservacaoPagamentoCrm {
  constructor(
    private readonly repo: OportunidadeRepository,
    private readonly movimentacoes: MovimentacaoRepository,
  ) {}

  async observarPagamentoConfirmado(input: { pessoaId: string }): Promise<void> {
    const abertas = await this.repo.oportunidadesAbertasDaPessoa(input.pessoaId);
    for (const oportunidade of abertas) {
      const primeiraGanha = [...oportunidade.pipeline.etapas]
        .filter((e) => e.tipo === 'GANHA')
        .sort((a, b) => a.ordem - b.ordem)[0];
      if (!primeiraGanha) continue; // pipeline sem etapa GANHA — nada a fazer
      await this.movimentacoes.mover({
        oportunidadeId: oportunidade.id,
        etapaAnteriorId: oportunidade.etapaId,
        etapaNovaId: primeiraGanha.id,
        movidoPorId: null,
        motivo: null,
      });
    }
  }
}
