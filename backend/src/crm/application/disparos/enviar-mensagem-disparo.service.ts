import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import { agoraUtc } from '../../../core/core.module';
import { CanalWhatsappRepository, MensagemWhatsappRepository, TemplateWhatsappRepository } from '../../infra/whatsapp';
import { MensagemDisparoRepository, type MensagemDisparoRow } from '../../infra/disparos';
import type { ExecucaoDisparoRow } from '../../infra/disparos';
import { CanalWhatsappService } from '../whatsapp/canal-whatsapp.service';
import { GRAPH_API_CLIENT, GraphApiError, type GraphApiClient } from '../whatsapp/graph-api-client';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';

/**
 * Envio de uma `MensagemDisparo` individual (spec 015). Cópia orquestrada do
 * mesmo caminho de `EnvioWhatsappService` (011) — Graph API →
 * `RegistrarInteracaoService` → `MensagemWhatsappRepository` — mas chamada
 * pelo worker em lote, sem janela de 24h (disparo é sempre por template
 * aprovado) e sem lançar exceção HTTP (research.md D-R1).
 */
@Injectable()
export class EnviarMensagemDisparoService {
  private readonly logger = new Logger(EnviarMensagemDisparoService.name);

  constructor(
    private readonly canais: CanalWhatsappRepository,
    private readonly canalService: CanalWhatsappService,
    private readonly templates: TemplateWhatsappRepository,
    private readonly mensagensWhatsapp: MensagemWhatsappRepository,
    private readonly mensagensDisparo: MensagemDisparoRepository,
    private readonly registrarInteracao: RegistrarInteracaoService,
    @Inject(GRAPH_API_CLIENT) private readonly graphApi: GraphApiClient,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  async enviar(mensagem: MensagemDisparoRow, execucao: ExecucaoDisparoRow): Promise<void> {
    const templateId = mensagem.variante === 'B' ? execucao.templateBId : execucao.templateId;
    const template = templateId ? await this.templates.obter(templateId) : null;
    if (!template || template.statusAprovacao !== 'APROVADO') {
      await this.mensagensDisparo.marcarTerminalSemRetry(
        mensagem.id,
        'FALHOU',
        'template_nao_aprovado',
      );
      return;
    }

    const canal = await this.canais.obter(execucao.canalId);
    if (!canal || !canal.ativo) {
      await this.mensagensDisparo.marcarTerminalSemRetry(mensagem.id, 'FALHOU', 'canal_inativo');
      return;
    }

    const accessToken = this.canalService.decifrarAccessToken(canal);
    let resultado;
    try {
      resultado = await this.graphApi.enviarMensagem({
        phoneNumberId: canal.phoneNumberId,
        accessToken,
        para: mensagem.telefone.replace(/^\+/, ''),
        corpo: { tipo: 'template', nomeMeta: template.nomeMeta, idioma: template.idioma, parametros: [] },
      });
    } catch (err) {
      const detalhe = err instanceof GraphApiError ? String(err.message) : 'falha_provedor';
      const tentativas = mensagem.tentativas + 1;
      const maxTentativas = this.cfg.get('CRM_DISPAROS_WORKER_MAX_TENTATIVAS', { infer: true });
      await this.mensagensDisparo.registrarFalhaRetentavel(
        mensagem.id,
        detalhe,
        tentativas,
        maxTentativas,
      );
      this.logger.warn(
        `disparo.envio.falhou execucaoId=${execucao.id} mensagemId=${mensagem.id} tentativa=${tentativas} motivo=${detalhe}`,
      );
      return;
    }

    // Sem âncora (CSV sem match e sem criação de Lead): nada para anexar na
    // timeline — o próprio `mensagem_disparo` já é o registro do envio.
    if (!mensagem.pessoaId && !mensagem.leadId) {
      await this.mensagensDisparo.marcarEnviada(mensagem.id, null);
      return;
    }

    const registro = await this.registrarInteracao.registrar(
      {
        pessoaId: mensagem.pessoaId,
        leadId: mensagem.leadId,
        tipo: 'WHATSAPP',
        direcao: 'SAIDA',
        conteudo: template.corpo,
        autorId: null,
        ocorridoEm: agoraUtc().toISOString(),
      },
      { canalOrigem: `whatsapp:${canal.id}`, idExterno: resultado.waMessageId },
    );

    const mensagemWhatsapp = registro.criada
      ? await this.mensagensWhatsapp.criar({
          interacaoId: registro.interacaoId,
          canalId: canal.id,
          templateId: template.id,
          waMessageId: resultado.waMessageId,
          tipoConteudo: 'TEXTO',
          midiaIdExterno: null,
          statusEntrega: 'ENVIADA',
          erroDetalhe: null,
        })
      : await this.mensagensWhatsapp.porInteracaoId(registro.interacaoId);

    await this.mensagensDisparo.marcarEnviada(mensagem.id, mensagemWhatsapp?.id ?? null);
  }
}
