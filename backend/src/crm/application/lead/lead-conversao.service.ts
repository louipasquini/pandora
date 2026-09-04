import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  PORTA_IDENTIDADE,
  type PortaIdentidade,
} from '../../../core/core.module';
import {
  montarDadosIdentidade,
  podeConverter,
} from '../../domain/lead/plano-conversao';
import type { ResultadoConversao } from '../../domain/lead/tipos';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { CrmLeadAuditService } from './crm-lead-audit.service';
import { LeadConsultaService } from './lead-consulta.service';

/**
 * Conversão Lead → Pessoa (spec 008, US4). Reusa a engine de identidade/dedup da
 * spec 005 **pela interface `PortaIdentidade` do `core`** (inversão de
 * dependência — CL-02): nenhum import de `src/clientes/**`. Síncrona,
 * transacional, idempotente. Pós-conversão o lead é **arquivado + vinculado**
 * (CL-01): `status = CONVERTIDO` + `pessoa_id`, nada apagado.
 *
 * O guard do endpoint já exige `lead:editar` **e** `pessoa:editar` (semântica E).
 */
@Injectable()
export class LeadConversaoService {
  constructor(
    @Inject(PORTA_IDENTIDADE) private readonly identidade: PortaIdentidade,
    private readonly repo: LeadRepository,
    private readonly audit: CrmLeadAuditService,
    private readonly consulta: LeadConsultaService,
  ) {}

  async converter(id: string, autor: string, req: Request): Promise<ResultadoConversao> {
    const lead = await this.consulta.exigirNoEscopo(id, req);

    // Idempotência: já convertido → devolve o mesmo vínculo, sem tocar nada.
    if (lead.status === 'CONVERTIDO' && lead.pessoaId) {
      return {
        leadId: lead.id,
        pessoaId: lead.pessoaId,
        criouPessoa: false,
        status: 'CONVERTIDO',
      };
    }

    const pode = podeConverter(lead);
    if (!pode.ok) {
      if (pode.erro === 'lead_descartado') {
        throw new ConflictException('lead descartado não converte');
      }
      throw new ConflictException('lead já convertido sem pessoa vinculada');
    }

    // `pessoa_origem_ref.plataforma_origem` é o enum das 7 contas — um lead do CRM
    // não é uma "conta de origem". O vínculo reverso vive em `lead.pessoa_id`.
    const res = await this.identidade.resolverOuCriar(montarDadosIdentidade(lead), {
      criar: true,
      origem: { plataformaOrigem: 'crm_lead', refs: [] },
    });
    if (!res.pessoaId) {
      throw new UnprocessableEntityException('não foi possível resolver ou criar a pessoa');
    }

    await this.repo.atualizar(lead.id, {
      pessoaId: res.pessoaId,
      status: 'CONVERTIDO',
      convertidoEm: new Date(),
    });
    await this.audit.registrar({
      autor,
      entidade: 'lead',
      entidadeId: lead.id,
      campo: 'conversao',
      valorAnterior: { status: lead.status, pessoaId: lead.pessoaId },
      valorNovo: { status: 'CONVERTIDO', pessoaId: res.pessoaId },
      motivo: 'converter',
    });

    return {
      leadId: lead.id,
      pessoaId: res.pessoaId,
      criouPessoa: res.criada,
      status: 'CONVERTIDO',
    };
  }
}
