import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { agoraUtc, parseInstante } from '../../core/core.module';
import { estaEmExpediente } from '../domain';
import { ExpedienteRepository } from '../infra/expediente.repository';
import { CrmAdminAuditService } from './crm-admin-audit.service';
import {
  hhmmParaMin,
  minParaHhmm,
  type CriarJanelaDto,
  type ListarJanelasDto,
  type PatchJanelaDto,
} from '../dto/janela.schema';
import type {
  CriarFeriadoDto,
  ListarFeriadosDto,
  PatchFeriadoDto,
} from '../dto/feriado.schema';
import type { ConsultarExpedienteDto } from '../dto/consultar-expediente.schema';

function janelaView(j: {
  id: string;
  equipeId: string | null;
  diaSemana: number;
  horaInicio: number;
  horaFim: number;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}) {
  return {
    id: j.id,
    equipeId: j.equipeId,
    diaSemana: j.diaSemana,
    horaInicio: minParaHhmm(j.horaInicio),
    horaFim: minParaHhmm(j.horaFim),
    ativo: j.ativo,
    criadoEm: j.criadoEm,
    atualizadoEm: j.atualizadoEm,
  };
}

function feriadoView(f: {
  id: string;
  equipeId: string | null;
  data: Date;
  descricao: string;
  recorrenteAnual: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}) {
  return {
    id: f.id,
    equipeId: f.equipeId,
    data: f.data.toISOString().slice(0, 10),
    descricao: f.descricao,
    recorrenteAnual: f.recorrenteAnual,
    criadoEm: f.criadoEm,
    atualizadoEm: f.atualizadoEm,
  };
}

@Injectable()
export class ExpedienteService {
  constructor(
    private readonly repo: ExpedienteRepository,
    private readonly audit: CrmAdminAuditService,
  ) {}

  // ---- janelas ----

  async listarJanelas(q: ListarJanelasDto) {
    const rows = await this.repo.listarJanelas({
      equipeId: q.equipeId,
      incluirGlobais: q.incluirGlobais ?? true,
      ativo: q.ativo,
    });
    return { itens: rows.map(janelaView) };
  }

  async criarJanela(dto: CriarJanelaDto, autor: string) {
    if (hhmmParaMin(dto.horaFim) <= hhmmParaMin(dto.horaInicio)) {
      throw new UnprocessableEntityException({
        erro: 'janela_invalida',
        detalhe: 'hora_fim > hora_inicio (sem cruzar a meia-noite)',
      });
    }
    await this.exigirEquipe(dto.equipeId ?? null);
    const { id } = await this.repo.criarJanela({
      equipeId: dto.equipeId ?? null,
      diaSemana: dto.diaSemana,
      horaInicio: hhmmParaMin(dto.horaInicio),
      horaFim: hhmmParaMin(dto.horaFim),
      ativo: dto.ativo,
    });
    const row = await this.repo.obterJanela(id);
    await this.audit.registrar({
      autor,
      entidade: 'janela_atendimento',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: janelaView(row!),
      motivo: 'janela criada via POST /crm/admin/janelas-atendimento',
    });
    return janelaView(row!);
  }

  async patchJanela(id: string, dto: PatchJanelaDto, autor: string) {
    const antes = await this.repo.obterJanela(id);
    if (!antes) throw new NotFoundException('janela não encontrada');
    const novoInicio =
      dto.horaInicio !== undefined ? hhmmParaMin(dto.horaInicio) : antes.horaInicio;
    const novoFim =
      dto.horaFim !== undefined ? hhmmParaMin(dto.horaFim) : antes.horaFim;
    if (novoFim <= novoInicio) {
      throw new UnprocessableEntityException({
        erro: 'janela_invalida',
        detalhe: 'hora_fim > hora_inicio',
      });
    }
    if (dto.equipeId !== undefined) await this.exigirEquipe(dto.equipeId);

    const data: Prisma.JanelaAtendimentoUpdateInput = {};
    if (dto.diaSemana !== undefined) data.diaSemana = dto.diaSemana;
    if (dto.horaInicio !== undefined) data.horaInicio = novoInicio;
    if (dto.horaFim !== undefined) data.horaFim = novoFim;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.equipeId !== undefined) {
      data.equipe = dto.equipeId
        ? { connect: { id: dto.equipeId } }
        : { disconnect: true };
    }
    if (Object.keys(data).length > 0) await this.repo.atualizarJanela(id, data);
    const depois = await this.repo.obterJanela(id);
    await this.audit.registrar({
      autor,
      entidade: 'janela_atendimento',
      entidadeId: id,
      campo: 'editado',
      valorAnterior: janelaView(antes),
      valorNovo: janelaView(depois!),
      motivo: 'janela editada via PATCH /crm/admin/janelas-atendimento/{id}',
    });
    return janelaView(depois!);
  }

  async removerJanela(id: string, autor: string) {
    const antes = await this.repo.obterJanela(id);
    if (!antes) throw new NotFoundException('janela não encontrada');
    await this.repo.removerJanela(id);
    await this.audit.registrar({
      autor,
      entidade: 'janela_atendimento',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: janelaView(antes),
      valorNovo: null,
      motivo: 'janela removida via DELETE /crm/admin/janelas-atendimento/{id}',
    });
  }

  // ---- feriados ----

  async listarFeriados(q: ListarFeriadosDto) {
    const rows = await this.repo.listarFeriados({
      equipeId: q.equipeId,
      incluirGlobais: q.incluirGlobais ?? true,
    });
    const itens = rows.map(feriadoView).filter((f) => {
      if (q.ano === undefined) return true;
      const [ano] = f.data.split('-').map(Number);
      return f.recorrenteAnual ? true : ano === q.ano;
    });
    return { itens };
  }

  async criarFeriado(dto: CriarFeriadoDto, autor: string) {
    await this.exigirEquipe(dto.equipeId ?? null);
    const { id } = await this.repo.criarFeriado({
      equipeId: dto.equipeId ?? null,
      data: dto.data,
      descricao: dto.descricao,
      recorrenteAnual: dto.recorrenteAnual,
    });
    const row = await this.repo.obterFeriado(id);
    await this.audit.registrar({
      autor,
      entidade: 'feriado',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: feriadoView(row!),
      motivo: 'feriado criado via POST /crm/admin/feriados',
    });
    return feriadoView(row!);
  }

  async patchFeriado(id: string, dto: PatchFeriadoDto, autor: string) {
    const antes = await this.repo.obterFeriado(id);
    if (!antes) throw new NotFoundException('feriado não encontrado');
    if (dto.equipeId !== undefined) await this.exigirEquipe(dto.equipeId);

    const data: Prisma.FeriadoUpdateInput = {};
    if (dto.data !== undefined) data.data = new Date(`${dto.data}T00:00:00Z`);
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.recorrenteAnual !== undefined) data.recorrenteAnual = dto.recorrenteAnual;
    if (dto.equipeId !== undefined) {
      data.equipe = dto.equipeId
        ? { connect: { id: dto.equipeId } }
        : { disconnect: true };
    }
    if (Object.keys(data).length > 0) await this.repo.atualizarFeriado(id, data);
    const depois = await this.repo.obterFeriado(id);
    await this.audit.registrar({
      autor,
      entidade: 'feriado',
      entidadeId: id,
      campo: 'editado',
      valorAnterior: feriadoView(antes),
      valorNovo: feriadoView(depois!),
      motivo: 'feriado editado via PATCH /crm/admin/feriados/{id}',
    });
    return feriadoView(depois!);
  }

  async removerFeriado(id: string, autor: string) {
    const antes = await this.repo.obterFeriado(id);
    if (!antes) throw new NotFoundException('feriado não encontrado');
    await this.repo.removerFeriado(id);
    await this.audit.registrar({
      autor,
      entidade: 'feriado',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: feriadoView(antes),
      valorNovo: null,
      motivo: 'feriado removido via DELETE /crm/admin/feriados/{id}',
    });
  }

  // ---- consulta ----

  async consultar(q: ConsultarExpedienteDto) {
    let instante: Date;
    if (q.instante === undefined) {
      instante = agoraUtc();
    } else {
      const r = parseInstante(q.instante);
      if (r.valor == null) {
        throw new BadRequestException({
          erro: 'instante_invalido',
          detalhe: r.motivo,
        });
      }
      instante = r.valor;
    }
    const { janelas, feriados, equipe } = await this.repo.carregarAplicaveis(
      q.equipeId,
    );
    const emExpediente = estaEmExpediente(instante, { janelas, feriados, equipe });
    return {
      emExpediente,
      instante: instante.toISOString(),
      equipeId: q.equipeId ?? null,
    };
  }

  private async exigirEquipe(equipeId: string | null): Promise<void> {
    if (equipeId == null) return;
    if (!(await this.repo.equipeExiste(equipeId))) {
      throw new NotFoundException('equipe não encontrada');
    }
  }
}
