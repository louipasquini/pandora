import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  idMidiaDaMensagem,
  mapearStatusEntrega,
  mapearTipoConteudo,
  payloadWebhookSchema,
  phoneNumberIdsDoPayload,
  verificarAssinatura,
  type MensagemWebhook,
  type PayloadWebhook,
  type StatusWebhook,
} from '../../domain/whatsapp';
import { normalizarNome, normalizarTelefone } from '../../domain/lead/normalizar-lead';
import {
  CanalWhatsappRepository,
  EventoWebhookWhatsappRepository,
  MensagemWhatsappRepository,
  type CanalWhatsappRow,
} from '../../infra/whatsapp';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';
import { RegistrarLeadService } from '../lead/registrar-lead.service';
import { CanalWhatsappService } from './canal-whatsapp.service';
import { AbrirAtendimentoService, CsatService } from '../atendimento';
import { AtendimentoRepository } from '../../infra/atendimento';

export type ResultadoProcessarWebhook =
  | { ok: true }
  | { ok: false; motivo: 'assinatura_invalida' | 'canal_nao_encontrado' | 'payload_invalido' };

type Ancora = { pessoaId: string; leadId?: never } | { leadId: string; pessoaId?: never };

@Injectable()
export class WebhookWhatsappService {
  private readonly logger = new Logger(WebhookWhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly canais: CanalWhatsappRepository,
    private readonly canalService: CanalWhatsappService,
    private readonly eventos: EventoWebhookWhatsappRepository,
    private readonly mensagens: MensagemWhatsappRepository,
    private readonly registrarInteracao: RegistrarInteracaoService,
    private readonly registrarLead: RegistrarLeadService,
    // spec 012 — abre/reaproveita o atendimento da inbox e detecta resposta de CSAT
    // antes do fluxo padrão de mensagem recebida (D-R5).
    private readonly abrirAtendimento: AbrirAtendimentoService,
    private readonly csat: CsatService,
    private readonly atendimentos: AtendimentoRepository,
  ) {}

  /** Handshake `GET` — compara `verifyToken` contra todo canal ativo. */
  async validarHandshake(verifyTokenCandidato: string): Promise<boolean> {
    const ativos = await this.canais.listarAtivos();
    for (const canal of ativos) {
      const verifyToken = this.canalService.decifrarWebhookVerifyToken(canal);
      if (verifyToken === verifyTokenCandidato) return true;
    }
    return false;
  }

  async processarEvento(
    corpoBruto: Buffer,
    headerAssinatura: string | undefined,
  ): Promise<ResultadoProcessarWebhook> {
    let payloadJson: unknown;
    try {
      payloadJson = JSON.parse(corpoBruto.toString('utf8'));
    } catch {
      return { ok: false, motivo: 'payload_invalido' };
    }
    const parse = payloadWebhookSchema.safeParse(payloadJson);
    if (!parse.success) {
      return { ok: false, motivo: 'payload_invalido' };
    }
    const payload = parse.data;

    const phoneNumberIds = phoneNumberIdsDoPayload(payload);
    const phoneNumberId = phoneNumberIds[0];
    const canal = phoneNumberId ? await this.canais.porPhoneNumberId(phoneNumberId) : null;
    if (!canal) {
      this.logger.warn(`webhook.whatsapp.reject motivo=canal_nao_encontrado phone_number_id=${phoneNumberId}`);
      return { ok: false, motivo: 'canal_nao_encontrado' };
    }

    const appSecret = this.canalService.decifrarAppSecret(canal);
    if (!verificarAssinatura(corpoBruto, headerAssinatura, appSecret)) {
      this.logger.warn(`webhook.whatsapp.reject motivo=assinatura_invalida canal=${canal.id}`);
      return { ok: false, motivo: 'assinatura_invalida' };
    }

    const hash = createHash('sha256').update(corpoBruto).digest('hex');
    const existente = await this.eventos.porHash(hash);
    if (existente) {
      this.logger.log(`webhook.whatsapp.reentrega canal=${canal.id} evento=${existente.id}`);
      return { ok: true };
    }

    const evento = await this.eventos.criar({
      canalId: canal.id,
      payloadBruto: payloadJson as never,
      hash,
      recebidoEm: agoraUtc(),
    });

    try {
      await this.processarPayload(payload, canal);
      await this.eventos.atualizarStatus(evento.id, 'PROCESSADO', null);
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : String(err);
      this.logger.error(`webhook.whatsapp.erro evento=${evento.id} detalhe=${detalhe}`);
      await this.eventos.atualizarStatus(evento.id, 'ERRO', detalhe);
    }
    await this.canais.marcarUltimoWebhookRecebido(canal.id, agoraUtc());

    return { ok: true };
  }

  private async processarPayload(
    payload: PayloadWebhook,
    canal: CanalWhatsappRow,
  ): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const nomePorTelefone = new Map<string, string>();
        for (const contato of change.value.contacts ?? []) {
          if (contato.profile?.name) nomePorTelefone.set(contato.wa_id, contato.profile.name);
        }
        for (const mensagem of change.value.messages ?? []) {
          await this.processarMensagemRecebida(mensagem, canal, nomePorTelefone.get(mensagem.from));
        }
        for (const status of change.value.statuses ?? []) {
          await this.processarStatus(status);
        }
      }
    }
  }

  private async resolverAncora(telefone: string, nomeContato: string | undefined): Promise<Ancora> {
    const pessoaTelefone = await this.prisma.pessoaTelefone.findFirst({
      where: { valor: telefone },
      select: { pessoaId: true },
    });
    if (pessoaTelefone) return { pessoaId: pessoaTelefone.pessoaId };

    const lead = await this.prisma.lead.findFirst({
      where: { telefone },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });
    if (lead) return { leadId: lead.id };

    const nome = normalizarNome(nomeContato ?? telefone).valor ?? telefone;
    const resultado = await this.registrarLead.registrar(
      { nome, telefone, origem: 'whatsapp' },
      { origem: 'whatsapp', idExterno: telefone },
    );
    return { leadId: resultado.leadId };
  }

  private async processarMensagemRecebida(
    mensagem: MensagemWebhook,
    canal: CanalWhatsappRow,
    nomeContato: string | undefined,
  ): Promise<void> {
    const norm = normalizarTelefone(mensagem.from);
    if (norm.erro !== undefined) {
      this.logger.warn(`webhook.whatsapp.telefone_invalido de=${mensagem.from} erro=${norm.erro}`);
      return;
    }
    const telefone = norm.valor as string;
    const ancora = await this.resolverAncora(telefone, nomeContato);

    // spec 012, D-R5 — resposta de CSAT (nota numérica) logo após o encerramento
    // de um atendimento elegível vira `interacao` tipo NPS, não uma mensagem
    // comum; qualquer outro texto segue o fluxo padrão abaixo.
    if (mensagem.type === 'text' && mensagem.text?.body) {
      const viraCsat = await this.csat.interpretarEntradaWebhook(ancora, mensagem.text.body);
      if (viraCsat) {
        this.logger.log(`webhook.whatsapp.csat_registrado canal=${canal.id} de=${telefone}`);
        return;
      }
    }

    const conteudo =
      mensagem.type === 'text' && mensagem.text?.body ? mensagem.text.body : `[${mensagem.type} recebido]`;
    const ocorridoEm = new Date(Number(mensagem.timestamp) * 1000);

    const resultado = await this.registrarInteracao.registrar(
      {
        ...ancora,
        tipo: 'WHATSAPP',
        direcao: 'ENTRADA',
        conteudo,
        autorId: null,
        ocorridoEm: (Number.isFinite(ocorridoEm.getTime()) ? ocorridoEm : agoraUtc()).toISOString(),
      },
      { canalOrigem: `whatsapp:${canal.id}`, idExterno: mensagem.id },
    );

    if (resultado.criada) {
      await this.mensagens.criar({
        interacaoId: resultado.interacaoId,
        canalId: canal.id,
        templateId: null,
        waMessageId: mensagem.id,
        tipoConteudo: mapearTipoConteudo(mensagem.type),
        midiaIdExterno: idMidiaDaMensagem(mensagem),
        statusEntrega: 'RECEBIDA',
        erroDetalhe: null,
      });

      // spec 012 — agrupa a nova interação sob o atendimento (fila/roteamento/
      // SLA), criando ou reaproveitando um atendimento aberto da mesma âncora.
      const abertura = await this.abrirAtendimento.abrirOuReaproveitar({
        ...ancora,
        canal: 'WHATSAPP',
        canalWhatsappId: canal.id,
      });
      await this.atendimentos.marcarInteracaoDoAtendimento(resultado.interacaoId, abertura.atendimentoId);
    }
  }

  private async processarStatus(status: StatusWebhook): Promise<void> {
    const mensagem = await this.mensagens.porWaMessageId(status.id);
    if (!mensagem) {
      this.logger.warn(`webhook.whatsapp.status_sem_mensagem wa_message_id=${status.id}`);
      return;
    }
    const statusEntrega = mapearStatusEntrega(status.status);
    if (!statusEntrega) {
      this.logger.warn(`webhook.whatsapp.status_desconhecido valor=${status.status}`);
      return;
    }
    const erroDetalhe =
      statusEntrega === 'FALHOU' ? (status.errors?.[0]?.title ?? 'erro desconhecido') : null;
    await this.mensagens.atualizarStatusEntrega(mensagem.id, statusEntrega, erroDetalhe);
  }
}
