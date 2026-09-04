import type { MensagemWhatsappStatusEntrega, MensagemWhatsappTipoConteudo } from '@prisma/client';

/**
 * `statuses[].status` da Meta → `MensagemWhatsappStatusEntrega` canônico
 * (spec 011). Valor desconhecido nunca lança — fallback seguro (`null`, quem
 * chama decide ignorar/logar), mesma disciplina de `paraStatusTransacaoCanonico`
 * do `core` (rede de segurança, nunca palpite).
 */
const MAPA_STATUS: Record<string, MensagemWhatsappStatusEntrega> = {
  sent: 'ENVIADA',
  delivered: 'ENTREGUE',
  read: 'LIDA',
  failed: 'FALHOU',
};

export function mapearStatusEntrega(
  statusMeta: string,
): MensagemWhatsappStatusEntrega | null {
  return MAPA_STATUS[statusMeta] ?? null;
}

/** `messages[].type` da Meta → `MensagemWhatsappTipoConteudo` canônico. */
const MAPA_TIPO_CONTEUDO: Record<string, MensagemWhatsappTipoConteudo> = {
  text: 'TEXTO',
  image: 'IMAGEM',
  audio: 'AUDIO',
  document: 'DOCUMENTO',
  video: 'VIDEO',
};

export function mapearTipoConteudo(tipoMeta: string): MensagemWhatsappTipoConteudo {
  return MAPA_TIPO_CONTEUDO[tipoMeta] ?? 'OUTRO';
}
