import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { validarAncora } from '../../domain/interacao/ancora';
import { estaDentroDaJanela24h } from '../../domain/whatsapp';
import { CanalWhatsappRepository, MensagemWhatsappRepository, TemplateWhatsappRepository } from '../../infra/whatsapp';
import type { EnviarMensagemWhatsappDto } from '../../dto/whatsapp/enviar-mensagem-whatsapp.schema';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';
import { CanalWhatsappService } from './canal-whatsapp.service';
import { GRAPH_API_CLIENT, GraphApiError, type GraphApiClient } from './graph-api-client';
import { OptOutWhatsappService } from './optout-whatsapp.service';

/**
 * `sub` do JWT é o id de um `Usuario` **ou** a credencial de serviço — mesma
 * resolução de `resolverAutorUsuario` em `interacao.service.ts` (009):
 * `autor_id` é FK `@db.Uuid`, credencial de serviço vira `null`.
 */
async function resolverAutorUsuario(req: Request, prisma: PrismaService): Promise<string | null> {
  const sub = (req as Request & { auth?: AuthContext }).auth?.sub;
  if (!sub || !EntidadeId.isValido(sub)) return null;
  const u = await prisma.usuario.findUnique({ where: { id: sub }, select: { id: true } });
  return u ? sub : null;
}

@Injectable()
export class EnvioWhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly canais: CanalWhatsappRepository,
    private readonly canalService: CanalWhatsappService,
    private readonly templates: TemplateWhatsappRepository,
    private readonly mensagens: MensagemWhatsappRepository,
    private readonly optOut: OptOutWhatsappService,
    private readonly registrarInteracao: RegistrarInteracaoService,
    @Inject(GRAPH_API_CLIENT) private readonly graphApi: GraphApiClient,
  ) {}

  private async resolverTelefone(ancora: { tipo: 'pessoa' | 'lead'; id: string }): Promise<string> {
    if (ancora.tipo === 'pessoa') {
      const tel = await this.prisma.pessoaTelefone.findFirst({
        where: { pessoaId: ancora.id },
        orderBy: [{ primario: 'desc' }, { criadoEm: 'asc' }],
        select: { valor: true },
      });
      return tel?.valor ?? '';
    }
    const lead = await this.prisma.lead.findUnique({
      where: { id: ancora.id },
      select: { telefone: true },
    });
    return lead?.telefone ?? '';
  }

  async enviar(dto: EnviarMensagemWhatsappDto, req: Request) {
    const autorId = await resolverAutorUsuario(req, this.prisma);
    const ancora = validarAncora({ pessoaId: dto.pessoaId, leadId: dto.leadId });
    if (!ancora.ok) throw new UnprocessableEntityException({ erro: `ancora_${ancora.erro}` });

    const telefone = await this.resolverTelefone(ancora);
    if (!telefone) throw new UnprocessableEntityException({ erro: 'sem_telefone' });

    const optOutAtivo = await this.optOut.ativoPorTelefone(telefone);
    if (optOutAtivo) throw new ConflictException({ erro: 'destinatario_em_optout' });

    const canal = await this.canais.obter(dto.canalId);
    if (!canal) throw new NotFoundException('canal de WhatsApp não encontrado');
    if (!canal.ativo) throw new ConflictException({ erro: 'canal_inativo' });

    let corpoGraphApi: Parameters<GraphApiClient['enviarMensagem']>[0]['corpo'];
    let conteudoInteracao: string;
    let templateId: string | null = null;

    if (dto.modo === 'LIVRE') {
      const ultima = await this.prisma.interacao.findFirst({
        where: {
          tipo: 'WHATSAPP',
          direcao: 'ENTRADA',
          ...(ancora.tipo === 'pessoa' ? { pessoaId: ancora.id } : { leadId: ancora.id }),
        },
        orderBy: [{ ocorridoEm: 'desc' }],
        select: { ocorridoEm: true },
      });
      if (!estaDentroDaJanela24h(ultima?.ocorridoEm ?? null, agoraUtc())) {
        throw new ConflictException({ erro: 'fora_da_janela_24h' });
      }
      corpoGraphApi = { tipo: 'texto', texto: dto.texto };
      conteudoInteracao = dto.texto;
    } else {
      const template = await this.templates.obter(dto.templateId);
      if (!template || template.canalId !== dto.canalId) {
        throw new NotFoundException('template de WhatsApp não encontrado neste canal');
      }
      if (template.statusAprovacao !== 'APROVADO') {
        throw new ConflictException({ erro: 'template_nao_aprovado' });
      }
      corpoGraphApi = {
        tipo: 'template',
        nomeMeta: template.nomeMeta,
        idioma: template.idioma,
        parametros: dto.parametros,
      };
      conteudoInteracao = template.corpo;
      templateId = template.id;
    }

    const accessToken = this.canalService.decifrarAccessToken(canal);
    let resultado;
    try {
      resultado = await this.graphApi.enviarMensagem({
        phoneNumberId: canal.phoneNumberId,
        accessToken,
        para: telefone.replace(/^\+/, ''),
        corpo: corpoGraphApi,
      });
    } catch (err) {
      const detalhe = err instanceof GraphApiError ? err.detalhe : undefined;
      throw new BadGatewayException({ erro: 'falha_provedor', detalhe });
    }

    const registro = await this.registrarInteracao.registrar(
      {
        pessoaId: dto.pessoaId ?? null,
        leadId: dto.leadId ?? null,
        tipo: 'WHATSAPP',
        direcao: 'SAIDA',
        conteudo: conteudoInteracao,
        autorId,
        ocorridoEm: agoraUtc().toISOString(),
      },
      { canalOrigem: `whatsapp:${canal.id}`, idExterno: resultado.waMessageId },
    );

    const mensagem = registro.criada
      ? await this.mensagens.criar({
          interacaoId: registro.interacaoId,
          canalId: canal.id,
          templateId,
          waMessageId: resultado.waMessageId,
          tipoConteudo: 'TEXTO',
          midiaIdExterno: null,
          statusEntrega: 'ENVIADA',
          erroDetalhe: null,
        })
      : await this.mensagens.porInteracaoId(registro.interacaoId);

    return { interacaoId: registro.interacaoId, mensagem };
  }
}
