import type { FluxoGatilhoTipo } from '@prisma/client';
import { acoesCompativeis, camposDoGatilho } from './catalogo-gatilho';
import type { AcaoFluxo, CondicaoNo } from './tipos';

export type ErroValidacaoFluxo =
  | { erro: 'campo_condicao_invalido'; campo: string }
  | { erro: 'acao_incompativel_com_gatilho'; acaoTipo: AcaoFluxo['tipo'] };

export type ResultadoValidacaoFluxo = { ok: true } | { ok: false; erro: ErroValidacaoFluxo };

function coletarCampos(no: CondicaoNo, out: Set<string>): void {
  if (no.tipo === 'folha') {
    out.add(no.campo);
    return;
  }
  for (const item of no.itens) coletarCampos(item, out);
}

/**
 * Todo `campo` referenciado na árvore de condições MUST pertencer ao
 * catálogo fechado do gatilho (research.md D-R3). `EVENTO_EXTERNO` não tem
 * catálogo (nunca executa) — qualquer condição não-vazia é rejeitada, para
 * não fingir uma validação que não tem como significar nada ainda.
 */
export function validarCondicoes(
  gatilhoTipo: FluxoGatilhoTipo,
  condicoes: CondicaoNo,
): ResultadoValidacaoFluxo {
  const usados = new Set<string>();
  coletarCampos(condicoes, usados);
  if (usados.size === 0) return { ok: true };

  const validos = new Set(camposDoGatilho(gatilhoTipo).map((c) => c.campo));
  for (const campo of usados) {
    if (!validos.has(campo)) {
      return { ok: false, erro: { erro: 'campo_condicao_invalido', campo } };
    }
  }
  return { ok: true };
}

/** Toda `acao` MUST pertencer ao catálogo compatível com o gatilho (contracts/workflow.md). */
export function validarAcoes(
  gatilhoTipo: FluxoGatilhoTipo,
  acoes: readonly AcaoFluxo[],
): ResultadoValidacaoFluxo {
  const permitidas = new Set(acoesCompativeis(gatilhoTipo));
  for (const acao of acoes) {
    if (!permitidas.has(acao.tipo)) {
      return { ok: false, erro: { erro: 'acao_incompativel_com_gatilho', acaoTipo: acao.tipo } };
    }
  }
  return { ok: true };
}

/**
 * Validação de forma antes de publicar (FR-015 parcial — a checagem de
 * "motivo obrigatório em etapa PERDIDA" depende de consultar a `EtapaPipeline`
 * no banco e vive na camada de aplicação, `fluxo.service.ts`, não aqui).
 */
export function validarParaPublicar(input: {
  gatilhoTipo: FluxoGatilhoTipo;
  condicoes: CondicaoNo;
  acoes: readonly AcaoFluxo[];
}): ResultadoValidacaoFluxo {
  const condicaoOk = validarCondicoes(input.gatilhoTipo, input.condicoes);
  if (!condicaoOk.ok) return condicaoOk;
  return validarAcoes(input.gatilhoTipo, input.acoes);
}
