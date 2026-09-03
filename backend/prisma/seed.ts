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

const prisma = new PrismaClient();

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
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('rbac.seed FALHOU', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
