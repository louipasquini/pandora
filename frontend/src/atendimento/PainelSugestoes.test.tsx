import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PainelSugestoes } from './PainelSugestoes';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';
import type { InteracaoView } from './atendimento-api';

const ATENDIMENTO_ID = 'at1';
const ENTRADA: InteracaoView = {
  id: 'i1',
  pessoaId: 'p1',
  leadId: null,
  tipo: 'TICKET',
  direcao: 'ENTRADA',
  conteudo: 'Posso parcelar?',
  notaNps: null,
  autorId: null,
  ocorridoEm: '2026-09-09T00:00:00Z',
};

const SUGESTAO_RESPOSTA = {
  id: 's1',
  atendimentoId: ATENDIMENTO_ID,
  tipo: 'RESPOSTA',
  perguntaDetectada: 'Posso parcelar?',
  faqItemId: 'f1',
  campoPersonalizadoLeadId: null,
  campoPersonalizadoPessoaId: null,
  conteudoSugerido: 'Em até 12x.',
  conteudoFinal: null,
  status: 'PENDENTE',
  util: null,
  criadoEm: '2026-09-09T00:01:00Z',
};

function servidor(perms: string[], sugestoes: unknown[] = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).replace(
      'http://localhost:3001',
      '',
    );
    const method = init?.method ?? 'GET';
    const ok = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/auth/permissoes-efetivas')) return ok({ permissoes: perms });
    if (url.match(/\/sugestoes\/s1\/aceitar$/) && method === 'POST')
      return ok({ ...SUGESTAO_RESPOSTA, status: 'ACEITA', conteudoFinal: 'Em até 12x.' });
    if (url.includes('/sugestoes') && method === 'POST')
      return ok({ itens: [SUGESTAO_RESPOSTA], aviso: null }, 201);
    if (url.includes('/sugestoes') && method === 'GET') return ok({ itens: sugestoes });
    return ok({ message: url }, 599);
  });
}

describe('PainelSugestoes (spec 013)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('pede sugestão para a mensagem de entrada selecionada', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:atender'], [SUGESTAO_RESPOSTA]));
    render(
      <ComAuth>
        <PainelSugestoes
          atendimentoId={ATENDIMENTO_ID}
          timelineItens={[ENTRADA]}
          podeAtender={true}
          onUsarResposta={() => {}}
        />
      </ComAuth>,
    );
    const botao = await screen.findByRole('button', { name: /Pedir sugestão/ });
    fireEvent.click(botao);
    expect(await screen.findByText('Resposta sugerida')).toBeInTheDocument();
  });

  it('aceitar uma sugestão de resposta chama onUsarResposta sem enviar nada', async () => {
    vi.stubGlobal('fetch', servidor(['atendimento:atender'], [SUGESTAO_RESPOSTA]));
    const onUsarResposta = vi.fn();
    render(
      <ComAuth>
        <PainelSugestoes
          atendimentoId={ATENDIMENTO_ID}
          timelineItens={[ENTRADA]}
          podeAtender={true}
          onUsarResposta={onUsarResposta}
        />
      </ComAuth>,
    );
    const aceitar = await screen.findByRole('button', { name: 'Aceitar' });
    fireEvent.click(aceitar);
    await waitFor(() => expect(onUsarResposta).toHaveBeenCalledWith('s1', 'Em até 12x.'));
  });

  it('sem podeAtender não renderiza nada', () => {
    vi.stubGlobal('fetch', servidor([]));
    const { container } = render(
      <ComAuth>
        <PainelSugestoes
          atendimentoId={ATENDIMENTO_ID}
          timelineItens={[ENTRADA]}
          podeAtender={false}
          onUsarResposta={() => {}}
        />
      </ComAuth>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
