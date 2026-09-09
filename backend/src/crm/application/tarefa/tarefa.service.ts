import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TarefaStatus } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { ehTerminal, validarTransicao } from '../../domain/tarefa';
import { ChecklistRepository } from '../../infra/tarefa/checklist.repository';
import { DependenciaRepository } from '../../infra/tarefa/dependencia.repository';
import { TarefaRepository, type TarefaRow } from '../../infra/tarefa/tarefa.repository';
import type { AtualizarTarefaDto, CriarTarefaDto } from '../../dto/tarefa.schema';
import { CrmTarefaAuditService } from './crm-tarefa-audit.service';
import { projetarTarefa, type TarefaProjetada } from './projetar-tarefa';
import { resolverUsuarioIdOuNulo } from './resolver-usuario';

export interface CriarTarefaOpts {
  criadoPorId: string | null;
  origem?: string;
}

/**
 * `tarefa` (spec 016, US1) — criar/atualizar/mudar status. Mesma disciplina
 * de `OportunidadeService`/`LeadService`: valida âncoras, audita delta real,
 * bloqueia edição/conclusão fora das regras de negócio (FR-002/FR-003/FR-004).
 */
@Injectable()
export class TarefaService {
  constructor(
    private readonly repo: TarefaRepository,
    private readonly checklist: ChecklistRepository,
    private readonly dependencias: DependenciaRepository,
    private readonly audit: CrmTarefaAuditService,
  ) {}

  private async validarAncoras(dto: {
    pessoaId?: string | null;
    leadId?: string | null;
    oportunidadeId?: string | null;
  }): Promise<void> {
    if (dto.pessoaId && !(await this.repo.pessoaExiste(dto.pessoaId))) {
      throw new NotFoundException('pessoa não encontrada');
    }
    if (dto.leadId && !(await this.repo.leadExiste(dto.leadId))) {
      throw new NotFoundException('lead não encontrado');
    }
    if (dto.oportunidadeId && !(await this.repo.oportunidadeExiste(dto.oportunidadeId))) {
      throw new NotFoundException('oportunidade não encontrada');
    }
  }

  async criar(dto: CriarTarefaDto, opts: CriarTarefaOpts): Promise<TarefaProjetada> {
    await this.validarAncoras(dto);
    const criadoPorId = await resolverUsuarioIdOuNulo(this.repo, opts.criadoPorId);

    const tarefa = await this.repo.criar({
      titulo: dto.titulo,
      descricao: dto.descricao ?? null,
      dataVencimento: dto.dataVencimento ? new Date(dto.dataVencimento) : null,
      responsavelId: dto.responsavelId ?? null,
      pessoaId: dto.pessoaId ?? null,
      leadId: dto.leadId ?? null,
      oportunidadeId: dto.oportunidadeId ?? null,
      criadoPorId,
      origem: opts.origem ?? 'manual',
    });

    if (dto.checklist && dto.checklist.length > 0) {
      for (let i = 0; i < dto.checklist.length; i++) {
        await this.checklist.criar(tarefa.id, dto.checklist[i], i);
      }
      return projetarTarefa((await this.repo.porId(tarefa.id)) as TarefaRow);
    }
    return projetarTarefa(tarefa);
  }

  async atualizar(id: string, dto: AtualizarTarefaDto, autor: string): Promise<TarefaProjetada> {
    const atual = await this.repo.porId(id);
    if (!atual) throw new NotFoundException('tarefa não encontrada');
    if (ehTerminal(atual.status)) {
      throw new ConflictException('tarefa em estado terminal não pode ser editada');
    }
    await this.validarAncoras(dto);

    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.dataVencimento !== undefined) {
      data.dataVencimento = dto.dataVencimento ? new Date(dto.dataVencimento) : null;
    }
    if (dto.pessoaId !== undefined) data.pessoaId = dto.pessoaId;
    if (dto.leadId !== undefined) data.leadId = dto.leadId;
    if (dto.oportunidadeId !== undefined) data.oportunidadeId = dto.oportunidadeId;

    const atualizado = await this.repo.atualizarCampos(id, data);
    await this.audit.registrar({
      autor,
      entidade: 'tarefa',
      entidadeId: id,
      campo: 'dados',
      valorAnterior: pick(atual, Object.keys(data)),
      valorNovo: pick(atualizado, Object.keys(data)),
      motivo: 'edicao',
    });
    return projetarTarefa(atualizado);
  }

  async mudarStatus(id: string, destino: TarefaStatus, autor: string): Promise<TarefaProjetada> {
    const atual = await this.repo.porId(id);
    if (!atual) throw new NotFoundException('tarefa não encontrada');

    const resultado = validarTransicao(atual.status, destino);
    if (!resultado.ok) throw new ConflictException(resultado.erro);

    if (destino === 'CONCLUIDA') {
      const pendentes = await this.dependencias.pendentes(id);
      if (pendentes.length > 0) {
        throw new ConflictException({
          message: 'tarefa tem dependência(s) pendente(s)',
          dependenciasPendentes: pendentes.map((p) => ({
            id: p.dependeDe.id,
            titulo: p.dependeDe.titulo,
          })),
        });
      }
    }

    const concluidoEm = destino === 'CONCLUIDA' ? agoraUtc() : destino === 'PENDENTE' ? null : atual.concluidoEm;
    const atualizado = await this.repo.atualizarCampos(id, { status: destino, concluidoEm });
    await this.audit.registrar({
      autor,
      entidade: 'tarefa',
      entidadeId: id,
      campo: 'status',
      valorAnterior: { status: atual.status },
      valorNovo: { status: destino },
      motivo: 'status',
    });
    return projetarTarefa(atualizado);
  }
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
