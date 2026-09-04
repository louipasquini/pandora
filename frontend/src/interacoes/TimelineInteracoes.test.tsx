import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineInteracoes } from './TimelineInteracoes';
import { semearToken } from '../test/auth-helpers';
import { ComAuth } from '../test/ComAuth';

// `semearToken()` usa `fakeJwt()`, cujo `sub` é `'pandora-panel'` — é o "eu" nestes testes.
const NOTA_PROPRIA = {
  id: 'I1',
  pessoaId: 'P1',
  leadId: null,
  tipo: 'NOTA',
  direcao: null,
  conteudo: 'nota própria',
  notaNps: null,
  autorId: 'pandora-panel',
  ocorridoEm: '2026-09-04T10:00:00Z',
  editadoEm: null,
  removidoEm: null,
  criadoEm: '2026-09-04T10:00:00Z',
};
const NOTA_DE_OUTRO = { ...NOTA_PROPRIA, id: 'I2', autorId: 'outro-usuario', conteudo: 'nota de outro' };
const LIGACAO = {
  ...NOTA_PROPRIA,
  id: 'I3',
  tipo: 'LIGACAO',
  direcao: 'SAIDA',
  conteudo: 'ligação',
};

function servidor(itens: unknown[]) {
  return vi.fn(async () => new Response(
    JSON.stringify({ itens, pagina: 1, tamanho: 25, total: itens.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

function montar(itens: unknown[], props: { podeRegistrar: boolean; podeGerir: boolean }) {
  vi.stubGlobal('fetch', servidor(itens));
  return render(
    <ComAuth>
      <TimelineInteracoes ancora={{ pessoaId: 'P1' }} {...props} />
    </ComAuth>,
  );
}

describe('TimelineInteracoes (spec 009)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    semearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('sem interacao:registrar → sem composer', async () => {
    montar([], { podeRegistrar: false, podeGerir: false });
    expect(await screen.findByText(/Nenhuma interação ainda/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('com interacao:registrar → composer aparece', async () => {
    montar([], { podeRegistrar: true, podeGerir: false });
    expect(await screen.findByRole('button', { name: 'Registrar' })).toBeInTheDocument();
  });

  it('nota própria: editar/remover aparecem mesmo sem interacao:gerir', async () => {
    montar([NOTA_PROPRIA], { podeRegistrar: true, podeGerir: false });
    await screen.findByText('nota própria');
    expect(screen.getByRole('button', { name: 'editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'remover' })).toBeInTheDocument();
  });

  it('nota de outro autor: sem interacao:gerir, sem editar/remover', async () => {
    montar([NOTA_DE_OUTRO], { podeRegistrar: true, podeGerir: false });
    await screen.findByText('nota de outro');
    expect(screen.queryByRole('button', { name: 'editar' })).not.toBeInTheDocument();
  });

  it('nota de outro autor: com interacao:gerir, editar/remover aparecem', async () => {
    montar([NOTA_DE_OUTRO], { podeRegistrar: true, podeGerir: true });
    await screen.findByText('nota de outro');
    expect(screen.getByRole('button', { name: 'editar' })).toBeInTheDocument();
  });

  it('LIGACAO nunca mostra editar/remover, mesmo com interacao:gerir', async () => {
    montar([LIGACAO], { podeRegistrar: true, podeGerir: true });
    await screen.findByText('ligação');
    expect(screen.queryByRole('button', { name: 'editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remover' })).not.toBeInTheDocument();
  });
});
