import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { atribuirVariante, resolverDestinatarios, type DestinatarioBruto } from '../../domain/disparos';
import { construirWhere, validarFiltro } from '../../domain/segmento/filtro-segmento';
import { ContatoImportadoRepository, ExecucaoDisparoRepository, MensagemDisparoRepository, type ExecucaoDisparoRow } from '../../infra/disparos';
import { SegmentoRepository } from '../../infra/segmento/segmento.repository';
import { TemplateWhatsappRepository } from '../../infra/whatsapp';
import { OptOutWhatsappService } from '../whatsapp/optout-whatsapp.service';

/**
 * Resolve a lista final de destinatários de uma `ExecucaoDisparo` e
 * materializa `MensagemDisparo` (spec 015, FR-004/FR-005/FR-006). Roda na
 * criação (envio imediato) ou pelo worker (agendado, no horário) — sempre a
 * mesma lógica, para a composição do segmento ser recalculada no momento
 * certo (research.md D-R2: sem escopo de visão por sujeito, só o filtro puro
 * do segmento).
 */
@Injectable()
export class MaterializarDestinatariosService {
  private readonly logger = new Logger(MaterializarDestinatariosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly execucoes: ExecucaoDisparoRepository,
    private readonly contatosImportados: ContatoImportadoRepository,
    private readonly mensagens: MensagemDisparoRepository,
    private readonly templates: TemplateWhatsappRepository,
    private readonly optOut: OptOutWhatsappService,
    private readonly segmentos: SegmentoRepository,
  ) {}

  private async membrosSegmento(segmentoId: string): Promise<DestinatarioBruto[]> {
    const segmento = await this.segmentos.porId(segmentoId);
    if (!segmento) return [];
    const validado = validarFiltro(segmento.alvo, segmento.filtro);
    const where = validado.ok ? construirWhere(validado.valor) : {};

    if (segmento.alvo === 'LEAD') {
      const leads = await this.prisma.lead.findMany({
        where: { ...(where as Prisma.LeadWhereInput), telefone: { not: null } },
        select: { id: true, telefone: true },
      });
      return leads
        .filter((l) => !!l.telefone)
        .map((l) => ({ telefone: l.telefone as string, leadId: l.id, pessoaId: null }));
    }

    const telefones = await this.prisma.pessoaTelefone.findMany({
      where: { primario: true, pessoa: where as Prisma.PessoaWhereInput },
      select: { valor: true, pessoaId: true },
    });
    return telefones.map((t) => ({ telefone: t.valor, pessoaId: t.pessoaId, leadId: null }));
  }

  private async contatosCsv(execucaoDisparoId: string): Promise<DestinatarioBruto[]> {
    const linhas = await this.contatosImportados.listarPorExecucao(execucaoDisparoId);
    return linhas.map((l) => ({ telefone: l.telefone, leadId: l.leadId, pessoaId: l.pessoaId }));
  }

  async materializar(execucao: ExecucaoDisparoRow): Promise<void> {
    const templateA = await this.templates.obter(execucao.templateId);
    const templateB = execucao.templateBId ? await this.templates.obter(execucao.templateBId) : null;
    const templateInvalido =
      !templateA ||
      templateA.statusAprovacao !== 'APROVADO' ||
      (execucao.templateBId && (!templateB || templateB.statusAprovacao !== 'APROVADO'));

    if (templateInvalido) {
      await this.execucoes.atualizar(execucao.id, {
        status: 'ERRO',
        erroDetalhe: 'template_nao_aprovado',
        iniciadoEm: agoraUtc(),
      });
      this.logger.warn(`disparo.materializar.erro execucaoId=${execucao.id} motivo=template_nao_aprovado`);
      return;
    }

    const [segmento, csv] = await Promise.all([
      execucao.segmentoId ? this.membrosSegmento(execucao.segmentoId) : Promise.resolve([]),
      this.contatosCsv(execucao.id),
    ]);
    const destinatarios = resolverDestinatarios({ segmento, csv });

    const linhas = await Promise.all(
      destinatarios.map(async (d) => {
        const emOptOut = await this.optOut.ativoPorTelefone(d.telefone).catch(() => null);
        if (emOptOut) {
          return {
            execucaoDisparoId: execucao.id,
            telefone: d.telefone,
            pessoaId: d.pessoaId,
            leadId: d.leadId,
            variante: null,
            status: 'PULADA' as const,
            motivo: 'opt_out',
          };
        }
        return {
          execucaoDisparoId: execucao.id,
          telefone: d.telefone,
          pessoaId: d.pessoaId,
          leadId: d.leadId,
          variante: execucao.templateBId
            ? atribuirVariante(d.telefone, execucao.percentualVarianteB)
            : null,
          status: 'PENDENTE' as const,
          motivo: null,
        };
      }),
    );

    await this.mensagens.criarLote(linhas);

    const restam = linhas.some((l) => l.status === 'PENDENTE');
    await this.execucoes.atualizar(execucao.id, {
      status: restam ? 'EM_ANDAMENTO' : 'CONCLUIDO',
      iniciadoEm: agoraUtc(),
      ...(restam ? {} : { concluidoEm: agoraUtc() }),
    });
    this.logger.log(
      `disparo.materializado execucaoId=${execucao.id} destinatarios=${linhas.length} pendentes=${linhas.filter((l) => l.status === 'PENDENTE').length}`,
    );
  }
}
