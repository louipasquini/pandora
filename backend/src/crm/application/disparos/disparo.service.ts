import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import type { CriarDisparoDto, ListarDestinatariosDto, ListarDisparosDto } from '../../dto/disparos/criar-disparo.schema';
import { ExecucaoDisparoRepository, MensagemDisparoRepository, type ExecucaoDisparoRow, type MensagemDisparoRow } from '../../infra/disparos';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { TemplateWhatsappRepository } from '../../infra/whatsapp';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import { ImportarCsvService } from './importar-csv.service';
import { MaterializarDestinatariosService } from './materializar-destinatarios.service';

function projetar(e: ExecucaoDisparoRow) {
  return {
    id: e.id,
    nome: e.nome,
    canalId: e.canalId,
    templateId: e.templateId,
    templateBId: e.templateBId,
    percentualVarianteB: e.percentualVarianteB,
    segmentoId: e.segmentoId,
    csvCriarLead: e.csvCriarLead,
    agendadoPara: e.agendadoPara,
    status: e.status,
    iniciadoEm: e.iniciadoEm,
    concluidoEm: e.concluidoEm,
    canceladoEm: e.canceladoEm,
    erroDetalhe: e.erroDetalhe,
    criadoEm: e.criadoEm,
    atualizadoEm: e.atualizadoEm,
  };
}

function projetarMensagem(m: MensagemDisparoRow) {
  return {
    id: m.id,
    telefone: m.telefone,
    pessoaId: m.pessoaId,
    leadId: m.leadId,
    variante: m.variante,
    status: m.status,
    motivo: m.motivo,
    tentativas: m.tentativas,
    criadoEm: m.criadoEm,
    atualizadoEm: m.atualizadoEm,
  };
}

/**
 * Ciclo de vida de `ExecucaoDisparo` (spec 015). `criar` cobre US1 (imediato/
 * agendado) e US3 (CSV — sempre parte da própria criação, nunca um passo
 * isolado). `cancelar` só é válido para `AGENDADO` (FR-003).
 */
@Injectable()
export class DisparoService {
  constructor(
    private readonly repo: ExecucaoDisparoRepository,
    private readonly mensagens: MensagemDisparoRepository,
    private readonly templates: TemplateWhatsappRepository,
    private readonly materializar: MaterializarDestinatariosService,
    private readonly importarCsv: ImportarCsvService,
    private readonly audit: CrmAdminAuditService,
    private readonly leads: LeadRepository,
  ) {}

  private async resolverCriadoPor(autor: string): Promise<string | null> {
    if (!EntidadeId.isValido(autor)) return null;
    return (await this.leads.usuarioExiste(autor)) ? autor : null;
  }

  async criar(dto: CriarDisparoDto, autor: string) {
    const csvConteudo = dto.csvConteudo ?? null;
    if (!dto.segmentoId && !csvConteudo) {
      throw new UnprocessableEntityException({ erro: 'sem_destino' });
    }

    const templateA = await this.templates.obter(dto.templateId);
    if (!templateA || templateA.canalId !== dto.canalId || templateA.statusAprovacao !== 'APROVADO') {
      throw new UnprocessableEntityException({ erro: 'template_nao_aprovado' });
    }
    if (dto.templateBId) {
      const templateB = await this.templates.obter(dto.templateBId);
      if (!templateB || templateB.canalId !== dto.canalId || templateB.statusAprovacao !== 'APROVADO') {
        throw new UnprocessableEntityException({ erro: 'template_nao_aprovado' });
      }
      if (dto.templateBId === dto.templateId) {
        throw new UnprocessableEntityException({ erro: 'variantes_iguais' });
      }
    }

    const agendadoPara = dto.agendadoPara ? new Date(dto.agendadoPara) : null;
    if (agendadoPara && agendadoPara.getTime() <= agoraUtc().getTime()) {
      throw new UnprocessableEntityException({ erro: 'agendamento_no_passado' });
    }

    const execucao = await this.repo.criar({
      nome: dto.nome,
      canalId: dto.canalId,
      templateId: dto.templateId,
      templateBId: dto.templateBId ?? null,
      percentualVarianteB: dto.percentualVarianteB ?? null,
      segmentoId: dto.segmentoId ?? null,
      csvCriarLead: csvConteudo ? dto.criarLead : null,
      agendadoPara,
      status: 'AGENDADO',
      criadoPor: await this.resolverCriadoPor(autor),
    });

    await this.audit.registrar({
      autor,
      entidade: 'execucao_disparo',
      entidadeId: execucao.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { nome: execucao.nome, canalId: execucao.canalId, agendadoPara: execucao.agendadoPara },
      motivo: 'disparo criado via POST /crm/disparos',
    });

    let importacaoCsv = null;
    if (csvConteudo) {
      importacaoCsv = await this.importarCsv.importar(execucao.id, csvConteudo, dto.criarLead);
    }

    if (!agendadoPara) {
      await this.materializar.materializar(execucao);
    }

    const atual = (await this.repo.porId(execucao.id)) ?? execucao;
    return { ...projetar(atual), ...(importacaoCsv ? { importacaoCsv } : {}) };
  }

  async cancelar(id: string, autor: string) {
    const execucao = await this.repo.porId(id);
    if (!execucao) throw new NotFoundException('disparo não encontrado');
    if (execucao.status !== 'AGENDADO') {
      throw new ConflictException({ erro: 'disparo_nao_cancelavel' });
    }
    const atualizado = await this.repo.atualizar(id, { status: 'CANCELADO', canceladoEm: agoraUtc() });
    await this.audit.registrar({
      autor,
      entidade: 'execucao_disparo',
      entidadeId: id,
      campo: 'cancelado',
      valorAnterior: { status: execucao.status },
      valorNovo: { status: 'CANCELADO' },
      motivo: 'disparo cancelado via POST /crm/disparos/{id}/cancelar',
    });
    return projetar(atualizado);
  }

  async listar(q: ListarDisparosDto) {
    const { itens, total } = await this.repo.listar({
      pagina: q.pagina,
      tamanho: q.tamanho,
      status: q.status,
      criadoDe: q.criadoDe ? new Date(q.criadoDe) : undefined,
      criadoAte: q.criadoAte ? new Date(q.criadoAte) : undefined,
    });
    const comContagens = await Promise.all(
      itens.map(async (e) => ({
        ...projetar(e),
        contagens: await this.repo.contarPorStatus(e.id),
      })),
    );
    return { itens: comContagens, pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async obter(id: string) {
    const e = await this.repo.porId(id);
    if (!e) throw new NotFoundException('disparo não encontrado');
    const [contagens, contagensPorVariante] = await Promise.all([
      this.repo.contarPorStatus(id),
      this.repo.contarPorVariante(id),
    ]);
    return { ...projetar(e), contagens, contagensPorVariante };
  }

  async listarDestinatarios(id: string, q: ListarDestinatariosDto) {
    const e = await this.repo.porId(id);
    if (!e) throw new NotFoundException('disparo não encontrado');
    const { itens, total } = await this.mensagens.listarPorExecucao(id, q);
    return { itens: itens.map(projetarMensagem), pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async exportarCsv(id: string): Promise<string> {
    const e = await this.repo.porId(id);
    if (!e) throw new NotFoundException('disparo não encontrado');
    const linhas = await this.mensagens.listarTodasPorExecucao(id);
    const cabecalho = 'telefone,status,variante,motivo\n';
    const corpo = linhas
      .map((l) => [l.telefone, l.status, l.variante ?? '', l.motivo ?? ''].join(','))
      .join('\n');
    return cabecalho + corpo;
  }
}
