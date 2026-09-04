-- spec 009 — interação/tag/segmento (7ª migração de negócio). Fecha o esboço
-- 5.2-E: timeline unificada (âncora pessoa XOR lead — CL-01), tag promovida a
-- entidade de 1ª classe compartilhada lead|pessoa|interacao (migra o
-- `lead.tags` da 008 — a coluna é removida abaixo), segmento (query salva,
-- membros sempre derivados na leitura). Ver docs/009-crm-interacao-timeline.md.

-- CreateEnum
CREATE TYPE "InteracaoTipo" AS ENUM ('WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET', 'NOTA', 'NPS');

-- CreateEnum
CREATE TYPE "InteracaoDirecao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "SegmentoAlvo" AS ENUM ('LEAD', 'PESSOA');

-- AlterTable — a migração da spec 008 removida (CL-04): sem dado de produção
-- nesta fase do projeto, então o corte é direto, sem etapa de backfill
-- (research.md §7).
ALTER TABLE "lead" DROP COLUMN "tags";

-- CreateTable
CREATE TABLE "interacao" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID,
    "lead_id" UUID,
    "tipo" "InteracaoTipo" NOT NULL,
    "direcao" "InteracaoDirecao",
    "conteudo" TEXT NOT NULL,
    "nota_nps" INTEGER,
    "autor_id" UUID,
    "canal_origem" TEXT,
    "id_externo" TEXT,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,
    "editado_em" TIMESTAMPTZ(6),
    "removido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_associacao" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "lead_id" UUID,
    "pessoa_id" UUID,
    "interacao_id" UUID,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_associacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmento" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "alvo" "SegmentoAlvo" NOT NULL,
    "filtro" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interacao_audit" (
    "id" UUID NOT NULL,
    "autor" TEXT NOT NULL,
    "quando" TIMESTAMPTZ(6) NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" JSONB,
    "valor_novo" JSONB,
    "motivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interacao_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interacao_pessoa_id_ocorrido_em_idx" ON "interacao"("pessoa_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "interacao_lead_id_ocorrido_em_idx" ON "interacao"("lead_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "interacao_tipo_idx" ON "interacao"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_key" ON "tag"("slug");

-- CreateIndex
CREATE INDEX "tag_associacao_tag_id_idx" ON "tag_associacao"("tag_id");

-- CreateIndex
CREATE INDEX "segmento_alvo_idx" ON "segmento"("alvo");

-- CreateIndex
CREATE INDEX "crm_interacao_audit_entidade_entidade_id_idx" ON "crm_interacao_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_interacao_id_fkey" FOREIGN KEY ("interacao_id") REFERENCES "interacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmento" ADD CONSTRAINT "segmento_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes que o Prisma 6 não expressa no schema.prisma — SQL à mão, mesmo
-- padrão das migrações 005/007/008 (índice parcial) + novidade desta spec
-- (CHECK de exclusividade de âncora, research.md §2 / plan.md Complexity Tracking).

-- Âncora exclusiva de `interacao`: exatamente um de pessoa_id/lead_id (CL-01).
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_ancora_exclusiva"
  CHECK (num_nonnulls("pessoa_id", "lead_id") = 1);

-- Só `NOTA` aceita edição/remoção (CL-05) — reforço no banco do que o serviço
-- já impede.
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_mutabilidade_so_nota"
  CHECK ("tipo" = 'NOTA' OR ("editado_em" IS NULL AND "removido_em" IS NULL));

-- Âncora exclusiva de `tag_associacao`: exatamente um de lead_id/pessoa_id/interacao_id.
ALTER TABLE "tag_associacao" ADD CONSTRAINT "tag_associacao_ancora_exclusiva"
  CHECK (num_nonnulls("lead_id", "pessoa_id", "interacao_id") = 1);

-- Índice único PARCIAL: idempotência da porta `RegistrarInteracaoService` por
-- (canal_origem, id_externo) — só quando ambos presentes.
CREATE UNIQUE INDEX "interacao_canal_origem_id_externo_key"
  ON "interacao" ("canal_origem", "id_externo")
  WHERE "canal_origem" IS NOT NULL AND "id_externo" IS NOT NULL;

-- 3 índices únicos PARCIAIS: nenhuma tag duplicada na mesma âncora (FR-016).
CREATE UNIQUE INDEX "tag_associacao_tag_lead_unico"
  ON "tag_associacao" ("tag_id", "lead_id") WHERE "lead_id" IS NOT NULL;

CREATE UNIQUE INDEX "tag_associacao_tag_pessoa_unico"
  ON "tag_associacao" ("tag_id", "pessoa_id") WHERE "pessoa_id" IS NOT NULL;

CREATE UNIQUE INDEX "tag_associacao_tag_interacao_unico"
  ON "tag_associacao" ("tag_id", "interacao_id") WHERE "interacao_id" IS NOT NULL;
