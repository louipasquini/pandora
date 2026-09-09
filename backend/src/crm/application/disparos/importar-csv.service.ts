import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseCsvContatos } from '../../domain/disparos';
import { ContatoImportadoRepository, type NovoContatoImportado } from '../../infra/disparos';
import { RegistrarLeadService } from '../lead/registrar-lead.service';

export interface RelatorioImportacaoCsv {
  totalLinhas: number;
  aceitas: number;
  rejeitadas: { linha: number; motivo: string }[];
}

/**
 * Importação de contatos avulsos de CSV (spec 015, FR-007/FR-007a) — sempre
 * parte da criação do disparo (`DisparoService.criar`), nunca um passo
 * isolado (US3 do spec.md: "na hora da importação" já é a criação). Contato
 * que já corresponde a uma pessoa/lead existente é só associado; contato novo
 * vira Lead (`origem: 'csv-disparo'`) só quando `criarLead=true`.
 */
@Injectable()
export class ImportarCsvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contatos: ContatoImportadoRepository,
    private readonly registrarLead: RegistrarLeadService,
  ) {}

  async importar(
    execucaoDisparoId: string,
    conteudoCsv: string,
    criarLead: boolean,
  ): Promise<RelatorioImportacaoCsv> {
    const { validos, invalidos } = parseCsvContatos(conteudoCsv);

    const linhas: NovoContatoImportado[] = [];
    for (const v of validos) {
      const pessoaTelefone = await this.prisma.pessoaTelefone.findFirst({
        where: { valor: v.telefone },
        select: { pessoaId: true },
      });
      if (pessoaTelefone) {
        linhas.push({
          execucaoDisparoId,
          telefone: v.telefone,
          nome: v.nome,
          pessoaId: pessoaTelefone.pessoaId,
          leadId: null,
        });
        continue;
      }

      const leadExistente = await this.prisma.lead.findFirst({
        where: { telefone: v.telefone },
        orderBy: { criadoEm: 'desc' },
        select: { id: true },
      });
      if (leadExistente) {
        linhas.push({
          execucaoDisparoId,
          telefone: v.telefone,
          nome: v.nome,
          pessoaId: null,
          leadId: leadExistente.id,
        });
        continue;
      }

      if (criarLead) {
        const { leadId } = await this.registrarLead.registrar(
          { nome: v.nome ?? v.telefone, telefone: v.telefone, origem: 'csv-disparo' },
          { origem: 'csv-disparo', idExterno: v.telefone },
        );
        linhas.push({ execucaoDisparoId, telefone: v.telefone, nome: v.nome, pessoaId: null, leadId });
        continue;
      }

      linhas.push({ execucaoDisparoId, telefone: v.telefone, nome: v.nome, pessoaId: null, leadId: null });
    }

    await this.contatos.criarLote(linhas);

    return { totalLinhas: validos.length + invalidos.length, aceitas: validos.length, rejeitadas: invalidos };
  }
}
