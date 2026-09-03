import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ContaRepository,
  type ContaDetalheView,
} from '../infra/conta.repository';
import { ClientesAuditService } from './clientes-audit.service';
import type {
  AssociarPessoaDto,
  CriarContaDto,
  PatchContaDto,
} from '../dto/conta.schema';
import type { ListaQueryDto } from '../dto/pessoa.schema';

export interface ContaDetalheResposta extends ContaDetalheView {
  unificacao?: { deId: string; em: Date; mergeId: string };
}

@Injectable()
export class ContaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ContaRepository,
    private readonly audit: ClientesAuditService,
  ) {}

  async listar(q: ListaQueryDto) {
    const { itens, total } = await this.repo.listar({
      q: q.q,
      pagina: q.pagina,
      tamanho: q.tamanho,
      incluirUnificadas: q.incluirUnificadas ?? false,
    });
    return { itens, pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async verDetalhe(id: string): Promise<ContaDetalheResposta> {
    const alvo = await this.repo.detalhe(id);
    if (!alvo) throw new NotFoundException('conta não encontrada');
    if (alvo.mergedPara == null) return alvo;
    const raiz = await this.repo.raizAtiva(id);
    const sobrevivente = await this.repo.detalhe(raiz);
    if (!sobrevivente) throw new NotFoundException('conta não encontrada');
    const merge = alvo.merges.find(
      (m) => m.papel === 'absorvida' && m.estado === 'ativo',
    );
    return {
      ...sobrevivente,
      unificacao: {
        deId: id,
        em: merge?.quando ?? sobrevivente.merges[0]?.quando ?? new Date(),
        mergeId: merge?.id ?? '',
      },
    };
  }

  async criar(dto: CriarContaDto, autor: string): Promise<ContaDetalheResposta> {
    const id = this.repo.novoId();
    await this.prisma.conta.create({
      data: { id, tipo: dto.tipo, nome: dto.nome.trim() },
    });
    await this.audit.registrar({
      autor,
      entidade: 'conta',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { tipo: dto.tipo, nome: dto.nome.trim() },
      motivo: 'conta criada manualmente',
    });
    return (await this.repo.detalhe(id))!;
  }

  async patch(
    id: string,
    dto: PatchContaDto,
    autor: string,
  ): Promise<ContaDetalheResposta> {
    const atual = await this.prisma.conta.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('conta não encontrada');
    if (atual.mergedPara != null)
      throw new ConflictException('conta unificada — edite a sobrevivente');

    const data: { nome?: string; tipo?: 'HOUSEHOLD' | 'EMPRESA' } = {};
    if (dto.nome != null && dto.nome.trim() !== atual.nome) data.nome = dto.nome.trim();
    if (dto.tipo != null && dto.tipo !== atual.tipo) data.tipo = dto.tipo;
    if (Object.keys(data).length > 0) {
      await this.prisma.conta.update({ where: { id }, data });
      await this.audit.registrar({
        autor,
        entidade: 'conta',
        entidadeId: id,
        campo: 'editado',
        valorAnterior: { nome: atual.nome, tipo: atual.tipo },
        valorNovo: { ...{ nome: atual.nome, tipo: atual.tipo }, ...data },
        motivo: 'conta editada manualmente',
      });
    }
    return (await this.repo.detalhe(id))!;
  }

  async associar(
    contaId: string,
    dto: AssociarPessoaDto,
    autor: string,
  ): Promise<ContaDetalheResposta> {
    const [conta, pessoa] = await Promise.all([
      this.prisma.conta.findUnique({ where: { id: contaId } }),
      this.prisma.pessoa.findUnique({ where: { id: dto.pessoaId } }),
    ]);
    if (!conta || !pessoa) throw new NotFoundException('conta ou pessoa não encontrada');
    if (pessoa.contaId === contaId) return (await this.repo.detalhe(contaId))!;
    if (pessoa.contaId != null)
      throw new ConflictException({
        message: 'pessoa já está em outra conta',
        contaId: pessoa.contaId,
      });

    await this.prisma.pessoa.update({
      where: { id: dto.pessoaId },
      data: { contaId },
    });
    await this.audit.registrar({
      autor,
      entidade: 'pessoa',
      entidadeId: dto.pessoaId,
      campo: 'conta_associada',
      valorAnterior: null,
      valorNovo: { contaId },
      motivo: 'pessoa associada a conta',
    });
    return (await this.repo.detalhe(contaId))!;
  }

  async desassociar(
    contaId: string,
    pessoaId: string,
    autor: string,
  ): Promise<void> {
    const pessoa = await this.prisma.pessoa.findUnique({ where: { id: pessoaId } });
    if (!pessoa || pessoa.contaId !== contaId)
      throw new NotFoundException('vínculo não encontrado');
    await this.prisma.pessoa.update({ where: { id: pessoaId }, data: { contaId: null } });
    await this.audit.registrar({
      autor,
      entidade: 'pessoa',
      entidadeId: pessoaId,
      campo: 'conta_desassociada',
      valorAnterior: { contaId },
      valorNovo: null,
      motivo: 'pessoa desassociada de conta',
    });
  }
}
