-- CreateEnum
CREATE TYPE "LeadEstagio" AS ENUM ('NOVO', 'CONTATO_FEITO', 'QUALIFICADO', 'NUTRICAO', 'DESQUALIFICADO');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('ATIVO', 'DESCARTADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "CampoPersonalizadoTipo" AS ENUM ('TEXTO', 'NUMERO', 'BOOLEANO', 'DATA', 'SELECAO');

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "documento" TEXT,
    "origem" TEXT,
    "id_externo" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "estagio" "LeadEstagio" NOT NULL DEFAULT 'NOVO',
    "status" "LeadStatus" NOT NULL DEFAULT 'ATIVO',
    "responsavel_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER NOT NULL DEFAULT 0,
    "score_atualizado_em" TIMESTAMPTZ(6),
    "pessoa_id" UUID,
    "convertido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campo_personalizado_lead" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tipo" "CampoPersonalizadoTipo" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campo_personalizado_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valor_campo_lead" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "definicao_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "valor_campo_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_audit" (
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

    CONSTRAINT "crm_lead_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_status_estagio_idx" ON "lead"("status", "estagio");

-- CreateIndex
CREATE INDEX "lead_responsavel_id_idx" ON "lead"("responsavel_id");

-- CreateIndex
CREATE INDEX "lead_origem_idx" ON "lead"("origem");

-- CreateIndex
CREATE INDEX "lead_email_idx" ON "lead"("email");

-- CreateIndex
CREATE INDEX "lead_telefone_idx" ON "lead"("telefone");

-- CreateIndex
CREATE INDEX "lead_pessoa_id_idx" ON "lead"("pessoa_id");

-- CreateIndex
CREATE UNIQUE INDEX "campo_personalizado_lead_chave_key" ON "campo_personalizado_lead"("chave");

-- CreateIndex
CREATE INDEX "valor_campo_lead_definicao_id_idx" ON "valor_campo_lead"("definicao_id");

-- CreateIndex
CREATE UNIQUE INDEX "valor_campo_lead_lead_id_definicao_id_key" ON "valor_campo_lead"("lead_id", "definicao_id");

-- CreateIndex
CREATE INDEX "crm_lead_audit_entidade_entidade_id_idx" ON "crm_lead_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_lead" ADD CONSTRAINT "valor_campo_lead_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_lead" ADD CONSTRAINT "valor_campo_lead_definicao_id_fkey" FOREIGN KEY ("definicao_id") REFERENCES "campo_personalizado_lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único PARCIAL: idempotência da porta `RegistrarLeadService` por (origem, id_externo).
-- O Prisma não expressa índice parcial no schema — feito aqui, à mão (mesmo padrão da 005/007).
CREATE UNIQUE INDEX "lead_origem_id_externo_key" ON "lead" ("origem", "id_externo") WHERE "id_externo" IS NOT NULL;
