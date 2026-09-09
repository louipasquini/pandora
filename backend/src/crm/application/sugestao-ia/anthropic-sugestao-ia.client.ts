import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PromptSugestaoIa } from '../../domain/sugestao-ia';
import { type AppConfig, cifraIntegracaoKey } from '../../../core/core.module';
import { decifrar } from '../../domain';
import { IntegracaoRepository } from '../../infra/integracao.repository';
import {
  NOME_INTEGRACAO_SUGESTAO_IA,
  type ResultadoChamadaIa,
  type SugestaoIaClient,
} from './sugestao-ia-client';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSAO = '2023-06-01';
const MODELO_PADRAO = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

interface ConfigIntegracao {
  modelo?: string;
}

/**
 * Implementação real de `SugestaoIaClient` via `fetch` nativo (0 dep — mesmo
 * padrão de `MetaGraphApiClient`, spec 011). A credencial reaproveita a
 * tabela `integracao` (spec 007) — `tipo=CONEXAO_INTERNA`, `alvo=EXTERNO`,
 * `nome=NOME_INTEGRACAO_SUGESTAO_IA` — cifrada com a mesma
 * `CRM_INTEGRACAO_CIFRA_KEY` (research.md D-R4). **Nunca lança** — qualquer
 * falha (credencial ausente/inativa, rede, formato de resposta inesperado)
 * devolve `{ ok: false, motivo }` (FR-014).
 */
@Injectable()
export class AnthropicSugestaoIaClient implements SugestaoIaClient {
  constructor(
    private readonly integracoes: IntegracaoRepository,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  async gerarSugestoes(prompt: PromptSugestaoIa): Promise<ResultadoChamadaIa> {
    const integracao = await this.integracoes.porNomeAtiva(NOME_INTEGRACAO_SUGESTAO_IA);
    if (!integracao || !integracao.segredoCifrado) {
      return { ok: false, motivo: 'credencial_nao_configurada' };
    }

    let apiKey: string;
    try {
      apiKey = decifrar(integracao.segredoCifrado, cifraIntegracaoKey(this.cfg));
    } catch {
      return { ok: false, motivo: 'credencial_ilegivel' };
    }

    const config = (integracao.config ?? {}) as ConfigIntegracao;
    const modelo = typeof config.modelo === 'string' && config.modelo.trim() ? config.modelo : MODELO_PADRAO;

    let resp: Response;
    try {
      resp = await fetch(ANTHROPIC_API_BASE, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSAO,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: MAX_TOKENS,
          system: prompt.sistema,
          messages: [{ role: 'user', content: prompt.usuario }],
        }),
      });
    } catch {
      return { ok: false, motivo: 'falha_de_rede' };
    }

    const json: unknown = await resp.json().catch(() => null);
    if (!resp.ok) {
      return { ok: false, motivo: `provedor_respondeu_${resp.status}` };
    }

    const textoBruto = extrairTexto(json);
    if (textoBruto == null) {
      return { ok: false, motivo: 'resposta_sem_texto' };
    }
    return { ok: true, textoBruto };
  }
}

function extrairTexto(json: unknown): string | null {
  const blocos = (json as { content?: unknown } | null)?.content;
  if (!Array.isArray(blocos)) return null;
  const bloco = blocos.find(
    (b): b is { type: string; text: string } =>
      typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text',
  );
  return typeof bloco?.text === 'string' ? bloco.text : null;
}
