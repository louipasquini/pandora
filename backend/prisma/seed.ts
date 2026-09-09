/**
 * Seed do RBAC (spec 004) — idempotente. Cria/atualiza o perfil de sistema
 * `administrador` e sincroniza suas `perfil_permissao` com o catálogo atual.
 *
 * Roda via `prisma migrate dev` / `prisma migrate reset` (bloco `prisma.seed` no
 * package.json), no `test/setup-db.ts` (e2e) e no CI. Reexecução não duplica nada.
 *
 * A resolução de autorização trata o `administrador` como "catálogo inteiro" pelo
 * id (ver src/auth/rbac/resolver-permissoes.ts), então este seed é sobretudo
 * cosmético — mantém a leitura do perfil coerente no painel.
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSOES } from '../src/auth/rbac/catalogo';
import {
  PERFIL_ADMIN_ID,
  PERFIL_ADMIN_NOME,
  PERFIL_ADMIN_NOME_NORMALIZADO,
} from '../src/auth/auth.constants';
import { condicaoVaziaPadrao, type AcaoFluxo, type CondicaoNo } from '../src/crm/domain/workflow';

const prisma = new PrismaClient();

/**
 * Biblioteca de automações prontas (spec 014, CL-02) — semeada, somente
 * leitura para o usuário; IDs fixos para o `upsert` ser idempotente.
 */
const FLUXOS_MODELO: {
  id: string;
  nome: string;
  descricao: string;
  gatilhoTipo: 'LEAD_CRIADO' | 'INTERACAO_REGISTRADA';
  condicoes: CondicaoNo;
  acoes: AcaoFluxo[];
}[] = [
  {
    id: '00000000-0000-7000-8000-000000000101',
    nome: 'Boas-vindas a lead novo',
    descricao: 'Registra uma nota de boas-vindas assim que um lead é criado.',
    gatilhoTipo: 'LEAD_CRIADO',
    condicoes: condicaoVaziaPadrao(),
    acoes: [{ tipo: 'REGISTRAR_NOTA', conteudo: 'Lead novo — dar as boas-vindas.' }],
  },
  {
    id: '00000000-0000-7000-8000-000000000102',
    nome: 'Tag por origem do site',
    descricao: 'Aplica a tag "site" a todo lead novo vindo da origem "site".',
    gatilhoTipo: 'LEAD_CRIADO',
    condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
    acoes: [{ tipo: 'APLICAR_TAG', tag: 'site' }],
  },
  {
    id: '00000000-0000-7000-8000-000000000103',
    nome: 'Marcar interesse em reengajamento',
    descricao: 'Aplica a tag "reengajar" a todo lead que registrar uma nova interação.',
    gatilhoTipo: 'INTERACAO_REGISTRADA',
    condicoes: condicaoVaziaPadrao(),
    acoes: [{ tipo: 'APLICAR_TAG', tag: 'reengajar' }],
  },
];

async function main(): Promise<void> {
  await prisma.perfil.upsert({
    where: { id: PERFIL_ADMIN_ID },
    create: {
      id: PERFIL_ADMIN_ID,
      nome: PERFIL_ADMIN_NOME,
      nomeNormalizado: PERFIL_ADMIN_NOME_NORMALIZADO,
      deSistema: true,
    },
    update: {
      nome: PERFIL_ADMIN_NOME,
      nomeNormalizado: PERFIL_ADMIN_NOME_NORMALIZADO,
      deSistema: true,
    },
  });

  const doCatalogo = new Set<string>(PERMISSOES.map((p) => p.id));
  const atuais = await prisma.perfilPermissao.findMany({
    where: { perfilId: PERFIL_ADMIN_ID },
    select: { permissao: true },
  });
  const jaTem = new Set(atuais.map((p) => p.permissao));

  const remover = [...jaTem].filter((p) => !doCatalogo.has(p));
  const adicionar = [...doCatalogo].filter((p) => !jaTem.has(p));

  if (remover.length > 0) {
    await prisma.perfilPermissao.deleteMany({
      where: { perfilId: PERFIL_ADMIN_ID, permissao: { in: remover } },
    });
  }
  if (adicionar.length > 0) {
    await prisma.perfilPermissao.createMany({
      data: adicionar.map((permissao) => ({ perfilId: PERFIL_ADMIN_ID, permissao })),
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `rbac.seed ok perfil=${PERFIL_ADMIN_NOME_NORMALIZADO} permissoes=${doCatalogo.size} (+${adicionar.length} -${remover.length})`,
  );

  for (const modelo of FLUXOS_MODELO) {
    await prisma.fluxoModelo.upsert({
      where: { id: modelo.id },
      create: {
        id: modelo.id,
        nome: modelo.nome,
        descricao: modelo.descricao,
        gatilhoTipo: modelo.gatilhoTipo,
        condicoes: modelo.condicoes as never,
        acoes: modelo.acoes as never,
      },
      update: {
        nome: modelo.nome,
        descricao: modelo.descricao,
        gatilhoTipo: modelo.gatilhoTipo,
        condicoes: modelo.condicoes as never,
        acoes: modelo.acoes as never,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`crm.workflow.seed ok modelos=${FLUXOS_MODELO.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('rbac.seed FALHOU', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
