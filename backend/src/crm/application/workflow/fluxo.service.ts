import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { FluxoGatilhoTipo } from '@prisma/client';
import {
  condicaoVaziaPadrao,
  validarParaPublicar,
  type AcaoFluxo,
  type CondicaoNo,
} from '../../domain/workflow';
import { FluxoRepository, type FluxoRow, type FluxoVersaoRow } from '../../infra/workflow/fluxo.repository';
import { PipelineRepository } from '../../infra/pipeline/pipeline.repository';

export function projetarVersao(v: FluxoVersaoRow) {
  return {
    id: v.id,
    numero: v.numero,
    status: v.status,
    gatilhoTipo: v.gatilhoTipo,
    condicoes: v.condicoes as unknown as CondicaoNo,
    acoes: v.acoes as unknown as AcaoFluxo[],
    autor: v.autor,
    publicadoPor: v.publicadoPor,
    publicadoEm: v.publicadoEm,
    arquivadoPor: v.arquivadoPor,
    arquivadoEm: v.arquivadoEm,
    criadoEm: v.criadoEm,
    atualizadoEm: v.atualizadoEm,
  };
}

/**
 * Ciclo de vida do fluxo (spec 014, US1/US3): criar, editar rascunho,
 * publicar (arquiva a publicada anterior, D-01), arquivar. `substituirRascunho`
 * valida só a **forma** (domínio puro); `publicar` soma a checagem que
 * depende do banco — motivo obrigatório quando `MOVER_OPORTUNIDADE_ETAPA`
 * aponta para uma etapa `PERDIDA` (FR-015).
 */
@Injectable()
export class FluxoService {
  constructor(
    private readonly repo: FluxoRepository,
    private readonly pipelines: PipelineRepository,
  ) {}

  async criar(
    dto: { nome: string; descricao?: string; gatilhoTipo: FluxoGatilhoTipo },
    autor: string,
  ) {
    const { fluxo, versao } = await this.repo.criarComRascunho({
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      criadoPor: autor,
      gatilhoTipo: dto.gatilhoTipo,
      condicoes: condicaoVaziaPadrao(),
      acoes: [],
    });
    return this.projetar(fluxo, [versao]);
  }

  async obter(id: string) {
    const fluxo = await this.repo.fluxoPorId(id);
    if (!fluxo) throw new NotFoundException('fluxo não encontrado');
    const versoes = await this.repo.listarVersoes(id);
    return this.projetar(fluxo, versoes);
  }

  async listar(filtro: { gatilhoTipo?: FluxoGatilhoTipo }) {
    const fluxos = await this.repo.listar(filtro);
    const itens = await Promise.all(
      fluxos.map(async (f) => this.projetar(f, await this.repo.listarVersoes(f.id))),
    );
    return itens;
  }

  async atualizarMetadado(id: string, dto: { nome?: string; descricao?: string }) {
    await this.exigirExiste(id);
    const fluxo = await this.repo.atualizarMetadado(id, dto);
    const versoes = await this.repo.listarVersoes(id);
    return this.projetar(fluxo, versoes);
  }

  async listarVersoes(id: string) {
    await this.exigirExiste(id);
    return (await this.repo.listarVersoes(id)).map(projetarVersao);
  }

  async substituirRascunho(
    id: string,
    dto: { gatilhoTipo: FluxoGatilhoTipo; condicoes: CondicaoNo; acoes: AcaoFluxo[] },
    autor: string,
  ) {
    await this.exigirExiste(id);
    const formaOk = validarParaPublicar({
      gatilhoTipo: dto.gatilhoTipo,
      condicoes: dto.condicoes,
      acoes: dto.acoes,
    });
    if (!formaOk.ok) {
      throw new UnprocessableEntityException(formaOk.erro);
    }
    const versao = await this.repo.substituirRascunho(id, { ...dto, autor });
    return projetarVersao(versao);
  }

  async publicar(id: string, autor: string) {
    await this.exigirExiste(id);
    const rascunho = await this.repo.rascunhoAtual(id);
    if (!rascunho) throw new UnprocessableEntityException({ erro: 'sem_rascunho' });

    const condicoes = rascunho.condicoes as unknown as CondicaoNo;
    const acoes = rascunho.acoes as unknown as AcaoFluxo[];
    const formaOk = validarParaPublicar({ gatilhoTipo: rascunho.gatilhoTipo, condicoes, acoes });
    if (!formaOk.ok) throw new UnprocessableEntityException(formaOk.erro);

    await this.validarMotivoObrigatorio(acoes);

    const versao = await this.repo.publicar(id, autor);
    return projetarVersao(versao);
  }

  async arquivar(id: string, autor: string) {
    await this.exigirExiste(id);
    try {
      const versao = await this.repo.arquivar(id, autor);
      return projetarVersao(versao);
    } catch {
      throw new ConflictException({ erro: 'sem_publicada' });
    }
  }

  /** FR-015 — `MOVER_OPORTUNIDADE_ETAPA` para uma etapa `PERDIDA` exige `motivo` já ao publicar. */
  private async validarMotivoObrigatorio(acoes: readonly AcaoFluxo[]): Promise<void> {
    for (const acao of acoes) {
      if (acao.tipo !== 'MOVER_OPORTUNIDADE_ETAPA') continue;
      const etapa = await this.pipelines.etapaPorId(acao.etapaDestinoId);
      if (!etapa) {
        throw new UnprocessableEntityException({ erro: 'etapa_destino_nao_encontrada' });
      }
      if (etapa.tipo === 'PERDIDA' && (!acao.motivo || acao.motivo.trim().length === 0)) {
        throw new UnprocessableEntityException({ erro: 'motivo_obrigatorio' });
      }
    }
  }

  private async exigirExiste(id: string): Promise<void> {
    const fluxo = await this.repo.fluxoPorId(id);
    if (!fluxo) throw new NotFoundException('fluxo não encontrado');
  }

  private projetar(fluxo: FluxoRow, versoes: FluxoVersaoRow[]) {
    const publicada = versoes.find((v) => v.status === 'PUBLICADA') ?? null;
    const rascunho = versoes.find((v) => v.status === 'RASCUNHO') ?? null;
    return {
      id: fluxo.id,
      nome: fluxo.nome,
      descricao: fluxo.descricao,
      criadoPor: fluxo.criadoPor,
      criadoEm: fluxo.criadoEm,
      atualizadoEm: fluxo.atualizadoEm,
      versaoPublicada: publicada ? projetarVersao(publicada) : null,
      versaoRascunho: rascunho ? projetarVersao(rascunho) : null,
    };
  }
}
