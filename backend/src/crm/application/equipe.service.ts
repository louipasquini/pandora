import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EquipeRepository } from '../infra/equipe.repository';
import { CrmAdminAuditService } from './crm-admin-audit.service';
import type {
  CriarEquipeDto,
  ListarEquipesDto,
  PatchEquipeDto,
} from '../dto/equipe.schema';
import type { AdicionarMembroDto, TrocarPapelDto } from '../dto/membro.schema';

@Injectable()
export class EquipeService {
  constructor(
    private readonly repo: EquipeRepository,
    private readonly audit: CrmAdminAuditService,
  ) {}

  async listar(q: ListarEquipesDto) {
    const { itens, total } = await this.repo.listar(q);
    return { itens, pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async detalhe(id: string) {
    const equipe = await this.repo.obter(id);
    if (!equipe) throw new NotFoundException('equipe não encontrada');
    const [ativos, historico] = await Promise.all([
      this.repo.membrosAtivos(id),
      this.repo.historicoMembros(id),
    ]);
    return {
      id: equipe.id,
      nome: equipe.nome,
      descricao: equipe.descricao,
      tipo: equipe.tipo,
      ativo: equipe.ativo,
      criadoEm: equipe.criadoEm,
      atualizadoEm: equipe.atualizadoEm,
      membrosAtivos: ativos.map((m) => ({
        usuarioId: m.usuarioId,
        nome: m.usuario.nome,
        email: m.usuario.email,
        papel: m.papel,
        entrouEm: m.entrouEm,
      })),
      historicoMembros: historico.map((m) => ({
        usuarioId: m.usuarioId,
        papel: m.papel,
        entrouEm: m.entrouEm,
        saiuEm: m.saiuEm,
      })),
    };
  }

  async criar(dto: CriarEquipeDto, autor: string) {
    const { id } = await this.repo.criar({
      nome: dto.nome,
      descricao: dto.descricao ?? undefined,
      tipo: dto.tipo,
    });
    await this.audit.registrar({
      autor,
      entidade: 'equipe',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { nome: dto.nome, tipo: dto.tipo, descricao: dto.descricao ?? null },
      motivo: 'equipe criada via POST /crm/admin/equipes',
    });
    return this.detalhe(id);
  }

  async patch(id: string, dto: PatchEquipeDto, autor: string) {
    const antes = await this.repo.obter(id);
    if (!antes) throw new NotFoundException('equipe não encontrada');

    const data: Prisma.EquipeUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (Object.keys(data).length > 0) await this.repo.atualizar(id, data);

    const soDesativou =
      dto.ativo === false &&
      dto.nome === undefined &&
      dto.descricao === undefined &&
      dto.tipo === undefined;

    await this.audit.registrar({
      autor,
      entidade: 'equipe',
      entidadeId: id,
      campo: soDesativou ? 'desativado' : 'editado',
      valorAnterior: {
        nome: antes.nome,
        descricao: antes.descricao,
        tipo: antes.tipo,
        ativo: antes.ativo,
      },
      valorNovo: {
        nome: dto.nome ?? antes.nome,
        descricao: dto.descricao === undefined ? antes.descricao : dto.descricao,
        tipo: dto.tipo ?? antes.tipo,
        ativo: dto.ativo ?? antes.ativo,
      },
      motivo: 'equipe editada via PATCH /crm/admin/equipes/{id}',
    });
    return this.detalhe(id);
  }

  async adicionarMembro(equipeId: string, dto: AdicionarMembroDto, autor: string) {
    const equipe = await this.repo.obter(equipeId);
    if (!equipe) throw new NotFoundException('equipe não encontrada');
    if (!(await this.repo.usuarioExiste(dto.usuarioId))) {
      throw new UnprocessableEntityException('usuário não encontrado');
    }
    let vinculo: { id: string; entrouEm: Date };
    try {
      vinculo = await this.repo.adicionarMembro({
        equipeId,
        usuarioId: dto.usuarioId,
        papel: dto.papel,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          erro: 'vinculo_ativo_existente',
          usuarioId: dto.usuarioId,
        });
      }
      throw e;
    }
    await this.audit.registrar({
      autor,
      entidade: 'equipe_membro',
      entidadeId: vinculo.id,
      campo: 'membro_adicionado',
      valorAnterior: null,
      valorNovo: { equipeId, usuarioId: dto.usuarioId, papel: dto.papel },
      motivo: 'membro adicionado via POST /crm/admin/equipes/{id}/membros',
    });
    return { usuarioId: dto.usuarioId, papel: dto.papel, entrouEm: vinculo.entrouEm };
  }

  async trocarPapel(
    equipeId: string,
    usuarioId: string,
    dto: TrocarPapelDto,
    autor: string,
  ) {
    const vinculo = await this.repo.vinculoAtivo(equipeId, usuarioId);
    if (!vinculo) throw new NotFoundException('vínculo ativo não encontrado');
    if (vinculo.papel === dto.papel) {
      return { usuarioId, papel: vinculo.papel, entrouEm: vinculo.entrouEm };
    }
    await this.repo.trocarPapel(vinculo.id, dto.papel);
    await this.audit.registrar({
      autor,
      entidade: 'equipe_membro',
      entidadeId: vinculo.id,
      campo: 'papel_trocado',
      valorAnterior: { papel: vinculo.papel },
      valorNovo: { papel: dto.papel },
      motivo: 'papel trocado via PATCH /crm/admin/equipes/{id}/membros/{usuarioId}',
    });
    return { usuarioId, papel: dto.papel, entrouEm: vinculo.entrouEm };
  }

  async removerMembro(equipeId: string, usuarioId: string, autor: string) {
    const vinculo = await this.repo.vinculoAtivo(equipeId, usuarioId);
    if (!vinculo) return; // idempotente — já saiu ou nunca existiu
    await this.repo.marcarSaida(vinculo.id);
    await this.audit.registrar({
      autor,
      entidade: 'equipe_membro',
      entidadeId: vinculo.id,
      campo: 'membro_removido',
      valorAnterior: { papel: vinculo.papel, entrouEm: vinculo.entrouEm },
      valorNovo: { saiuEm: 'preenchido' },
      motivo: 'membro removido via DELETE /crm/admin/equipes/{id}/membros/{usuarioId}',
    });
  }
}
