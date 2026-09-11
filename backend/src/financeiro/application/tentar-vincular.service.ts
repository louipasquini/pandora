import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { contaAsaasParDe, contaGuruParDe } from '../domain';
import { VinculoRepository, type TransacaoParaVinculo } from '../infra/vinculo.repository';

export interface ResultadoTentativa {
  vinculado: boolean;
  transacaoVinculadaId?: string;
  vinculoId?: string;
  /** só quando `papel: 'GURU'` — quantas Asaas pendentes foram resolvidas agora. */
  pendentesResolvidas?: number;
  papel: 'ASAAS' | 'GURU';
  /** por que `vinculado: false` — `undefined` quando `vinculado: true`. */
  motivo?: 'sem_referencia_externa' | 'guru_nao_encontrada' | 'conflito_guru_ja_vinculada';
}

/**
 * Lógica de domínio única do vínculo Asaas↔Guru (spec 024) — reusada pelo
 * executor da etapa 4 (`ResolverVinculoEtapaService`) **e** pelos 2 endpoints de
 * retry manual (`transacao.controller.ts`). Garante que os dois sentidos de
 * chegada (CL-02) e o retry manual nunca divirjam em comportamento. **Nunca
 * lança** para um estado de negócio válido (pendente, sem referência, conflito)
 * — só para entrada inválida (`transacaoId` inexistente, plataforma fora do
 * escopo do vínculo); o controller HTTP decide quando isso vira 404/422.
 */
@Injectable()
export class TentarVincularService {
  constructor(private readonly repo: VinculoRepository) {}

  /** Ponto de entrada único — decide o papel pela plataforma da própria transação. */
  async tentar(transacaoId: string): Promise<ResultadoTentativa> {
    const t = await this.repo.buscarPorId(transacaoId);
    if (!t) throw new NotFoundException('transação não encontrada');

    if (
      t.plataformaOrigem === PlataformaOrigem.ASAAS_PRD ||
      t.plataformaOrigem === PlataformaOrigem.ASAAS_SVC
    ) {
      return this.tentarComoAsaas(t);
    }
    if (
      t.plataformaOrigem === PlataformaOrigem.GURU_PRD ||
      t.plataformaOrigem === PlataformaOrigem.GURU_SVC
    ) {
      return this.tentarComoGuru(t.plataformaOrigem, t.idOrigem);
    }
    throw new UnprocessableEntityException({
      erro: 'plataforma_nao_aplicavel',
      mensagem: 'vínculo Asaas↔Guru só se aplica a transações Asaas ou Guru',
    });
  }

  /**
   * Ramo Asaas: procura a Guru pareada já persistida. Idempotente. Nunca lança
   * — "sem referência externa" e "Guru ainda não existe" são estados de negócio
   * válidos, não erros (nunca um palpite: pendente ≠ errado).
   */
  async tentarComoAsaas(t: TransacaoParaVinculo): Promise<ResultadoTentativa> {
    if (t.transacaoVinculadaId) {
      return { vinculado: true, transacaoVinculadaId: t.transacaoVinculadaId, papel: 'ASAAS' };
    }
    if (!t.referenciaExternaIdOrigem) {
      return { vinculado: false, papel: 'ASAAS', motivo: 'sem_referencia_externa' };
    }

    const contaGuru = contaGuruParDe(t.plataformaOrigem);
    if (!contaGuru) {
      // guarda de tipo — `t.plataformaOrigem` já foi validado como Asaas pelo chamador.
      return { vinculado: false, papel: 'ASAAS', motivo: 'guru_nao_encontrada' };
    }

    const guru = await this.repo.buscarPorChaveNatural(
      contaGuru as PlataformaOrigem,
      t.referenciaExternaIdOrigem,
    );
    if (!guru) {
      return { vinculado: false, papel: 'ASAAS', motivo: 'guru_nao_encontrada' };
    }

    const conflito = await this.repo.buscarVinculoPorGuru(guru.id);
    if (conflito && conflito.transacaoAsaasId !== t.id) {
      await this.repo.marcarRevisaoPorConflito(
        t.id,
        `referência externa aponta para uma transação Guru (${t.referenciaExternaIdOrigem}) ` +
          'já vinculada a outra transação Asaas — possível dado inconsistente na origem',
      );
      return { vinculado: false, papel: 'ASAAS', motivo: 'conflito_guru_ja_vinculada' };
    }

    const vinculo = await this.repo.criarVinculo(guru.id, t.id, t.referenciaExternaIdOrigem);
    return {
      vinculado: true,
      transacaoVinculadaId: vinculo.transacaoGuruId,
      vinculoId: vinculo.vinculoId,
      papel: 'ASAAS',
    };
  }

  /** Ramo Guru: resolve as Asaas pendentes da conta pareada que apontam para mim. */
  async tentarComoGuru(
    plataformaGuru: PlataformaOrigem,
    idOrigemGuru: string,
  ): Promise<ResultadoTentativa> {
    const contaAsaas = contaAsaasParDe(plataformaGuru);
    if (!contaAsaas) return { vinculado: false, papel: 'GURU', pendentesResolvidas: 0 };

    const pendentes = await this.repo.buscarAsaasPendentesPorReferencia(
      contaAsaas as PlataformaOrigem,
      idOrigemGuru,
    );
    let resolvidas = 0;
    for (const asaas of pendentes) {
      const r = await this.tentarComoAsaas(asaas);
      if (r.vinculado) resolvidas += 1;
    }
    return { vinculado: resolvidas > 0, papel: 'GURU', pendentesResolvidas: resolvidas };
  }

  /** Varre todas as Asaas pendentes (qualquer conta) e tenta resolver cada uma. */
  async tentarPendentes(): Promise<{ tentativas: number; resolvidos: number }> {
    const pendentes = await this.repo.buscarTodasPendentes();
    let resolvidos = 0;
    for (const t of pendentes) {
      const r = await this.tentarComoAsaas(t);
      if (r.vinculado) resolvidos += 1;
    }
    return { tentativas: pendentes.length, resolvidos };
  }
}
