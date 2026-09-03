import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Integracao, Prisma } from '@prisma/client';
import {
  type AppConfig,
  cifraIntegracaoKey,
} from '../../core/core.module';
import {
  cifrar,
  gerarApiKey,
  mascararSegredo,
  ultimos4De,
} from '../domain';
import { IntegracaoRepository } from '../infra/integracao.repository';
import { CrmAdminAuditService } from './crm-admin-audit.service';
import type {
  CriarIntegracaoDto,
  ListarIntegracoesDto,
  PatchIntegracaoDto,
  RotacionarDto,
} from '../dto/integracao.schema';

/** Projeção de leitura — o segredo NUNCA sai daqui. */
export interface IntegracaoView {
  id: string;
  nome: string;
  tipo: string;
  alvo: string;
  config: unknown;
  ativo: boolean;
  ultimoUsoEm: Date | null;
  segredoDefinido: boolean;
  segredoMascarado: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

@Injectable()
export class IntegracaoService {
  constructor(
    private readonly repo: IntegracaoRepository,
    private readonly audit: CrmAdminAuditService,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  private chave(): Buffer {
    return cifraIntegracaoKey(this.cfg);
  }

  projetar(row: Integracao): IntegracaoView {
    return {
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      alvo: row.alvo,
      config: row.config,
      ativo: row.ativo,
      ultimoUsoEm: row.ultimoUsoEm,
      segredoDefinido: row.segredoCifrado != null || row.segredoHash != null,
      segredoMascarado: mascararSegredo(row.segredoUltimos4),
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    };
  }

  async listar(q: ListarIntegracoesDto) {
    const { itens, total } = await this.repo.listar(q);
    return {
      itens: itens.map((i) => this.projetar(i)),
      pagina: q.pagina,
      tamanho: q.tamanho,
      total,
    };
  }

  async obter(id: string): Promise<IntegracaoView> {
    const row = await this.repo.obter(id);
    if (!row) throw new NotFoundException('integração não encontrada');
    return this.projetar(row);
  }

  async criar(dto: CriarIntegracaoDto, autor: string) {
    let segredoCifrado: string | null = null;
    let segredoHash: string | null = null;
    let segredoUltimos4: string | null = null;
    let apiKeyRevelada: string | null = null;

    if (dto.tipo === 'API_KEY' && dto.segredo === undefined) {
      const gerada = gerarApiKey();
      segredoHash = gerada.hash;
      segredoUltimos4 = ultimos4De(gerada.valor);
      apiKeyRevelada = gerada.valor;
    } else if (dto.segredo !== undefined) {
      segredoCifrado = cifrar(dto.segredo, this.chave());
      segredoUltimos4 = ultimos4De(dto.segredo);
    }

    const { id } = await this.repo.criar({
      nome: dto.nome,
      tipo: dto.tipo,
      alvo: dto.alvo,
      config: dto.config as Prisma.InputJsonValue,
      ativo: dto.ativo,
      segredoCifrado,
      segredoHash,
      segredoUltimos4,
    });

    await this.audit.registrar({
      autor,
      entidade: 'integracao',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: {
        nome: dto.nome,
        tipo: dto.tipo,
        alvo: dto.alvo,
        ...(segredoCifrado || segredoHash ? { segredo: 'definido' } : {}),
      },
      motivo: 'integração criada via POST /crm/admin/integracoes',
    });

    const integracao = this.projetar((await this.repo.obter(id))!);
    return apiKeyRevelada
      ? {
          integracao,
          apiKey: apiKeyRevelada,
          aviso: 'guarde agora — este valor não será exibido de novo',
        }
      : { integracao };
  }

  async atualizar(id: string, dto: PatchIntegracaoDto, autor: string) {
    const antes = await this.repo.obter(id);
    if (!antes) throw new NotFoundException('integração não encontrada');

    const data: Prisma.IntegracaoUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.alvo !== undefined) data.alvo = dto.alvo;
    if (dto.config !== undefined) data.config = dto.config as Prisma.InputJsonValue;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    let rotacionouSegredo = false;
    if (dto.segredo !== undefined) {
      data.segredoCifrado = cifrar(dto.segredo, this.chave());
      data.segredoHash = null;
      data.segredoUltimos4 = ultimos4De(dto.segredo);
      rotacionouSegredo = true;
    }

    if (Object.keys(data).length > 0) await this.repo.atualizar(id, data);
    const depois = (await this.repo.obter(id))!;

    await this.audit.registrar({
      autor,
      entidade: 'integracao',
      entidadeId: id,
      campo: rotacionouSegredo ? 'segredo_rotacionado' : 'editado',
      valorAnterior: {
        nome: antes.nome,
        alvo: antes.alvo,
        ativo: antes.ativo,
        config: antes.config,
      },
      valorNovo: {
        nome: depois.nome,
        alvo: depois.alvo,
        ativo: depois.ativo,
        config: depois.config,
        ...(rotacionouSegredo ? { segredo: 'rotacionado' } : {}),
      },
      motivo: 'integração editada via PATCH /crm/admin/integracoes/{id}',
    });
    return this.projetar(depois);
  }

  async rotacionar(id: string, dto: RotacionarDto, autor: string) {
    const antes = await this.repo.obter(id);
    if (!antes) throw new NotFoundException('integração não encontrada');

    const temSegredo =
      antes.segredoCifrado != null || antes.segredoHash != null;
    if (
      antes.tipo === 'CONEXAO_INTERNA' &&
      !temSegredo &&
      dto.segredo === undefined
    ) {
      throw new ConflictException({ erro: 'sem_segredo_para_rotacionar' });
    }

    let apiKeyRevelada: string | null = null;
    const data: Prisma.IntegracaoUpdateInput = {};

    if (dto.segredo !== undefined) {
      data.segredoCifrado = cifrar(dto.segredo, this.chave());
      data.segredoHash = null;
      data.segredoUltimos4 = ultimos4De(dto.segredo);
    } else if (antes.tipo === 'API_KEY') {
      const gerada = gerarApiKey();
      data.segredoHash = gerada.hash;
      data.segredoCifrado = null;
      data.segredoUltimos4 = ultimos4De(gerada.valor);
      apiKeyRevelada = gerada.valor;
    } else {
      // WEBHOOK/EXTERNO sem valor fornecido → gera um segredo opaco novo
      const novo = gerarApiKey().valor;
      data.segredoCifrado = cifrar(novo, this.chave());
      data.segredoHash = null;
      data.segredoUltimos4 = ultimos4De(novo);
      apiKeyRevelada = novo;
    }

    await this.repo.atualizar(id, data);
    await this.audit.registrar({
      autor,
      entidade: 'integracao',
      entidadeId: id,
      campo: 'segredo_rotacionado',
      valorAnterior: { segredo: temSegredo ? 'definido' : 'ausente' },
      valorNovo: { segredo: 'rotacionado' },
      motivo: 'segredo rotacionado via POST /crm/admin/integracoes/{id}/rotacionar',
    });

    const integracao = this.projetar((await this.repo.obter(id))!);
    return apiKeyRevelada
      ? {
          integracao,
          apiKey: apiKeyRevelada,
          aviso: 'guarde agora — este valor não será exibido de novo',
        }
      : { integracao };
  }
}
