import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { agoraUtc } from '../../../core/core.module';
import { estaEmExpediente } from '../../domain';
import { escolherAtendentePorCarga } from '../../domain/atendimento';
import { validarAncora } from '../../domain/interacao/ancora';
import { EquipeRepository } from '../../infra/equipe.repository';
import { ExpedienteRepository } from '../../infra/expediente.repository';
import { AtendimentoRepository, type AtendimentoRow } from '../../infra/atendimento';
import { EnvioWhatsappService } from '../whatsapp/envio-whatsapp.service';

/** SLA padrão quando a equipe não tem `slaPrimeiraRespostaMinutos` configurado. */
export const SLA_PADRAO_MINUTOS = 30;

export interface AbrirAtendimentoEntrada {
  pessoaId?: string | null;
  leadId?: string | null;
  canal: 'WHATSAPP' | 'MANUAL';
  canalWhatsappId?: string | null;
}

/**
 * Porta interna (spec 012) — chamada pelo webhook do WhatsApp (011, editado) a
 * cada interação de entrada nova, e pelo endpoint manual de criação de
 * atendimento (canal MANUAL). Idempotente: procura um atendimento aberto
 * antes de criar; endereça por carga/disponibilidade (CL-01); dispara a
 * resposta automática fora do expediente (D-R6) quando ninguém está
 * disponível e a equipe tem o texto configurado.
 */
@Injectable()
export class AbrirAtendimentoService {
  private readonly logger = new Logger(AbrirAtendimentoService.name);

  constructor(
    private readonly atendimentos: AtendimentoRepository,
    private readonly equipes: EquipeRepository,
    private readonly expedientes: ExpedienteRepository,
    private readonly envioWhatsapp: EnvioWhatsappService,
  ) {}

  async abrirOuReaproveitar(
    entrada: AbrirAtendimentoEntrada,
  ): Promise<{ atendimentoId: string; criado: boolean; atendimento: AtendimentoRow }> {
    const ancora = validarAncora({ pessoaId: entrada.pessoaId, leadId: entrada.leadId });
    if (!ancora.ok) throw new Error(`âncora inválida para atendimento: ${ancora.erro}`);

    const existente = await this.atendimentos.atendimentoAbertoPorAncoraECanal(
      { pessoaId: entrada.pessoaId, leadId: entrada.leadId },
      entrada.canal,
      entrada.canalWhatsappId ?? null,
    );
    if (existente) {
      return { atendimentoId: existente.id, criado: false, atendimento: existente };
    }

    const equipesDePlantao = await this.equipesAtendimentoEmExpediente();
    const membros = await this.membrosAtivosDeTodas(equipesDePlantao.map((e) => e.id));
    const cargas = await this.atendimentos.contarCargaPorUsuario(membros.map((m) => m.usuarioId));
    const candidatos = membros.map((m) => ({
      usuarioId: m.usuarioId,
      cargaAtual: cargas.get(m.usuarioId) ?? 0,
    }));
    const escolhidoId = escolherAtendentePorCarga(candidatos);
    const equipeEscolhidaId = escolhidoId
      ? membros.find((m) => m.usuarioId === escolhidoId)?.equipeId ?? null
      : null;

    const slaMinutos = await this.slaParaEquipe(equipeEscolhidaId);

    const atendimento = await this.atendimentos.criar({
      pessoaId: entrada.pessoaId ?? null,
      leadId: entrada.leadId ?? null,
      canal: entrada.canal,
      canalWhatsappId: entrada.canalWhatsappId ?? null,
      equipeId: equipeEscolhidaId,
      atendenteAtualId: escolhidoId,
      status: escolhidoId ? 'EM_ATENDIMENTO' : 'AGUARDANDO',
      slaMinutos,
      abertoEm: agoraUtc(),
    });

    if (!escolhidoId && entrada.canal === 'WHATSAPP' && entrada.canalWhatsappId) {
      await this.tentarRespostaAutomaticaForaExpediente(atendimento, entrada.canalWhatsappId);
    }

    return { atendimentoId: atendimento.id, criado: true, atendimento };
  }

  private async equipesAtendimentoEmExpediente(): Promise<{ id: string }[]> {
    const { itens } = await this.equipes.listar({ tipo: 'ATENDIMENTO', ativo: true, pagina: 1, tamanho: 200 });
    const agora = agoraUtc();
    const emExpediente: { id: string }[] = [];
    for (const equipe of itens) {
      const { janelas, feriados, equipe: equipeAplic } = await this.expedientes.carregarAplicaveis(equipe.id);
      if (estaEmExpediente(agora, { janelas, feriados, equipe: equipeAplic })) {
        emExpediente.push({ id: equipe.id });
      }
    }
    return emExpediente;
  }

  private async membrosAtivosDeTodas(
    equipeIds: readonly string[],
  ): Promise<{ usuarioId: string; equipeId: string }[]> {
    const resultado: { usuarioId: string; equipeId: string }[] = [];
    for (const equipeId of equipeIds) {
      const membros = await this.equipes.membrosAtivos(equipeId);
      for (const m of membros) {
        // membro pode aparecer em > 1 equipe de plantão — mantém a 1ª ocorrência
        if (!resultado.some((r) => r.usuarioId === m.usuarioId)) {
          resultado.push({ usuarioId: m.usuarioId, equipeId });
        }
      }
    }
    return resultado;
  }

  private async slaParaEquipe(equipeId: string | null): Promise<number> {
    if (equipeId == null) return SLA_PADRAO_MINUTOS;
    const equipe = await this.equipes.obter(equipeId);
    return equipe?.slaPrimeiraRespostaMinutos ?? SLA_PADRAO_MINUTOS;
  }

  /** D-R6 — só canal WHATSAPP; enviada no máximo 1× por atendimento; nunca marca `primeiraRespostaEm`. */
  private async tentarRespostaAutomaticaForaExpediente(
    atendimento: AtendimentoRow,
    canalWhatsappId: string,
  ): Promise<void> {
    try {
      const jaEnviada = await this.atendimentos.existeInteracaoDeSaidaAutomatica(atendimento.id);
      if (jaEnviada) return;

      const mensagem = await this.mensagemForaExpedienteDisponivel();
      if (!mensagem) return;

      await this.envioWhatsapp.enviar(
        {
          pessoaId: atendimento.pessoaId ?? undefined,
          leadId: atendimento.leadId ?? undefined,
          canalId: canalWhatsappId,
          modo: 'LIVRE',
          texto: mensagem,
        },
        {} as Request,
      );
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `atendimento.resposta_automatica.falha atendimento=${atendimento.id} detalhe=${detalhe}`,
      );
    }
  }

  private async mensagemForaExpedienteDisponivel(): Promise<string | null> {
    const { itens } = await this.equipes.listar({ tipo: 'ATENDIMENTO', ativo: true, pagina: 1, tamanho: 200 });
    const ordenadas = [...itens].sort((a, b) => a.nome.localeCompare(b.nome));
    for (const resumo of ordenadas) {
      const equipe = await this.equipes.obter(resumo.id);
      if (equipe?.mensagemForaExpediente) return equipe.mensagemForaExpediente;
    }
    return null;
  }
}
