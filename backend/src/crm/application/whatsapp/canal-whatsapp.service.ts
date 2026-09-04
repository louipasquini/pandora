import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CanalWhatsapp } from '@prisma/client';
import { type AppConfig, cifraIntegracaoKey } from '../../../core/core.module';
import { cifrar, decifrar, mascararSegredo, ultimos4De } from '../../domain';
import { CanalWhatsappRepository } from '../../infra/whatsapp';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import type {
  AtualizarCanalWhatsappDto,
  CriarCanalWhatsappDto,
} from '../../dto/whatsapp/canal-whatsapp.schema';

/** Projeção de leitura — os 3 segredos NUNCA saem em claro daqui. */
export interface CanalWhatsappView {
  id: string;
  nome: string;
  numeroTelefone: string;
  wabaId: string;
  phoneNumberId: string;
  ativo: boolean;
  ultimoWebhookRecebidoEm: Date | null;
  accessTokenDefinido: boolean;
  accessTokenMascarado: string | null;
  appSecretDefinido: boolean;
  appSecretMascarado: string | null;
  webhookVerifyTokenDefinido: boolean;
  webhookVerifyTokenMascarado: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

@Injectable()
export class CanalWhatsappService {
  constructor(
    private readonly repo: CanalWhatsappRepository,
    private readonly audit: CrmAdminAuditService,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  private chave(): Buffer {
    return cifraIntegracaoKey(this.cfg);
  }

  projetar(row: CanalWhatsapp): CanalWhatsappView {
    return {
      id: row.id,
      nome: row.nome,
      numeroTelefone: row.numeroTelefone,
      wabaId: row.wabaId,
      phoneNumberId: row.phoneNumberId,
      ativo: row.ativo,
      ultimoWebhookRecebidoEm: row.ultimoWebhookRecebidoEm,
      accessTokenDefinido: true,
      accessTokenMascarado: mascararSegredo(row.accessTokenUltimos4),
      appSecretDefinido: true,
      appSecretMascarado: mascararSegredo(row.appSecretUltimos4),
      webhookVerifyTokenDefinido: true,
      webhookVerifyTokenMascarado: mascararSegredo(row.webhookVerifyTokenUltimos4),
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    };
  }

  async listar(q: { pagina: number; tamanho: number }) {
    const { itens, total } = await this.repo.listar(q);
    return { itens: itens.map((i) => this.projetar(i)), pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async obter(id: string): Promise<CanalWhatsappView> {
    const row = await this.repo.obter(id);
    if (!row) throw new NotFoundException('canal de WhatsApp não encontrado');
    return this.projetar(row);
  }

  async criar(dto: CriarCanalWhatsappDto, autor: string) {
    const existente = await this.repo.porPhoneNumberId(dto.phoneNumberId);
    if (existente) {
      throw new ConflictException({ erro: 'phone_number_id_ja_conectado' });
    }

    const chave = this.chave();
    const row = await this.repo.criar({
      nome: dto.nome,
      numeroTelefone: dto.numeroTelefone,
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      accessTokenCifrado: cifrar(dto.accessToken, chave),
      accessTokenUltimos4: ultimos4De(dto.accessToken),
      appSecretCifrado: cifrar(dto.appSecret, chave),
      appSecretUltimos4: ultimos4De(dto.appSecret),
      webhookVerifyTokenCifrado: cifrar(dto.webhookVerifyToken, chave),
      webhookVerifyTokenUltimos4: ultimos4De(dto.webhookVerifyToken),
      ativo: dto.ativo ?? true,
    });

    await this.audit.registrar({
      autor,
      entidade: 'canal_whatsapp',
      entidadeId: row.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: {
        nome: dto.nome,
        numeroTelefone: dto.numeroTelefone,
        phoneNumberId: dto.phoneNumberId,
        segredo: 'definido',
      },
      motivo: 'canal de WhatsApp criado via POST /crm/admin/whatsapp/canais',
    });

    return this.projetar(row);
  }

  async atualizar(id: string, dto: AtualizarCanalWhatsappDto, autor: string) {
    const antes = await this.repo.obter(id);
    if (!antes) throw new NotFoundException('canal de WhatsApp não encontrado');

    const chave = this.chave();
    const data: Parameters<CanalWhatsappRepository['atualizar']>[1] = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.numeroTelefone !== undefined) data.numeroTelefone = dto.numeroTelefone;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    let rotacionouSegredo = false;
    if (dto.accessToken !== undefined) {
      data.accessTokenCifrado = cifrar(dto.accessToken, chave);
      data.accessTokenUltimos4 = ultimos4De(dto.accessToken);
      rotacionouSegredo = true;
    }
    if (dto.appSecret !== undefined) {
      data.appSecretCifrado = cifrar(dto.appSecret, chave);
      data.appSecretUltimos4 = ultimos4De(dto.appSecret);
      rotacionouSegredo = true;
    }
    if (dto.webhookVerifyToken !== undefined) {
      data.webhookVerifyTokenCifrado = cifrar(dto.webhookVerifyToken, chave);
      data.webhookVerifyTokenUltimos4 = ultimos4De(dto.webhookVerifyToken);
      rotacionouSegredo = true;
    }

    const depois = await this.repo.atualizar(id, data);

    await this.audit.registrar({
      autor,
      entidade: 'canal_whatsapp',
      entidadeId: id,
      campo: rotacionouSegredo ? 'segredo_rotacionado' : 'editado',
      valorAnterior: { nome: antes.nome, numeroTelefone: antes.numeroTelefone, ativo: antes.ativo },
      valorNovo: {
        nome: depois.nome,
        numeroTelefone: depois.numeroTelefone,
        ativo: depois.ativo,
        ...(rotacionouSegredo ? { segredo: 'rotacionado' } : {}),
      },
      motivo: 'canal de WhatsApp editado via PATCH /crm/admin/whatsapp/canais/{id}',
    });

    return this.projetar(depois);
  }

  /** Decifra o access token para uso interno (envio/sincronização) — nunca sai da aplicação. */
  decifrarAccessToken(row: CanalWhatsapp): string {
    return this.decifrarCampo(row.accessTokenCifrado);
  }

  decifrarAppSecret(row: CanalWhatsapp): string {
    return this.decifrarCampo(row.appSecretCifrado);
  }

  decifrarWebhookVerifyToken(row: CanalWhatsapp): string {
    return this.decifrarCampo(row.webhookVerifyTokenCifrado);
  }

  private decifrarCampo(cifrado: string): string {
    return decifrar(cifrado, this.chave());
  }
}
