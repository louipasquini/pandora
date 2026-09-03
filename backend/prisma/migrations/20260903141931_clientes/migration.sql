-- CreateEnum
CREATE TYPE "PlataformaOrigem" AS ENUM ('TMB', 'ASAAS_PRD', 'ASAAS_SVC', 'GURU_PRD', 'GURU_SVC', 'HOTMART_PRD', 'HOTMART_SVC');

-- CreateEnum
CREATE TYPE "PessoaTipo" AS ENUM ('FISICA', 'JURIDICA', 'DESCONHECIDO');

-- CreateEnum
CREATE TYPE "ContaTipo" AS ENUM ('HOUSEHOLD', 'EMPRESA');

-- CreateEnum
CREATE TYPE "DocumentoTipo" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "MergeEstado" AS ENUM ('ATIVO', 'DESFEITO');

-- CreateTable
CREATE TABLE "pessoa" (
    "id" UUID NOT NULL,
    "tipo" "PessoaTipo" NOT NULL DEFAULT 'DESCONHECIDO',
    "nome" TEXT NOT NULL,
    "conta_id" UUID,
    "pseudonimizada_em" TIMESTAMPTZ(6),
    "merged_para" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta" (
    "id" UUID NOT NULL,
    "tipo" "ContaTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "merged_para" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_email" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "primario" BOOLEAN NOT NULL DEFAULT false,
    "curado" BOOLEAN NOT NULL DEFAULT false,
    "rebaixado_em" TIMESTAMPTZ(6),
    "origem_merge_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pessoa_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_telefone" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "primario" BOOLEAN NOT NULL DEFAULT false,
    "curado" BOOLEAN NOT NULL DEFAULT false,
    "rebaixado_em" TIMESTAMPTZ(6),
    "origem_merge_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pessoa_telefone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_documento" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "tipo" "DocumentoTipo" NOT NULL,
    "valor" TEXT NOT NULL,
    "curado" BOOLEAN NOT NULL DEFAULT false,
    "origem_merge_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pessoa_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_endereco" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'BR',
    "curado" BOOLEAN NOT NULL DEFAULT false,
    "origem_merge_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pessoa_endereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_origem_ref" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "plataforma_origem" "PlataformaOrigem" NOT NULL,
    "tipo_ref" TEXT NOT NULL,
    "valor_ref" TEXT NOT NULL,
    "origem_merge_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_origem_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_pessoa" (
    "id" UUID NOT NULL,
    "sobrevivente_id" UUID NOT NULL,
    "absorvida_id" UUID NOT NULL,
    "autor" TEXT NOT NULL,
    "quando" TIMESTAMPTZ(6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "estado" "MergeEstado" NOT NULL DEFAULT 'ATIVO',
    "desfeito_por" TEXT,
    "desfeito_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_conta" (
    "id" UUID NOT NULL,
    "sobrevivente_id" UUID NOT NULL,
    "absorvida_id" UUID NOT NULL,
    "autor" TEXT NOT NULL,
    "quando" TIMESTAMPTZ(6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "estado" "MergeEstado" NOT NULL DEFAULT 'ATIVO',
    "desfeito_por" TEXT,
    "desfeito_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_reconciliacao" (
    "id" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "origem" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_curado" JSONB,
    "valor_derivado" JSONB,
    "motivo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_reconciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_audit" (
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

    CONSTRAINT "clientes_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pessoa_conta_id_idx" ON "pessoa"("conta_id");

-- CreateIndex
CREATE INDEX "pessoa_merged_para_idx" ON "pessoa"("merged_para");

-- CreateIndex
CREATE INDEX "conta_merged_para_idx" ON "conta"("merged_para");

-- CreateIndex
CREATE INDEX "pessoa_email_valor_idx" ON "pessoa_email"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_email_pessoa_id_valor_key" ON "pessoa_email"("pessoa_id", "valor");

-- CreateIndex
CREATE INDEX "pessoa_telefone_valor_idx" ON "pessoa_telefone"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_telefone_pessoa_id_valor_key" ON "pessoa_telefone"("pessoa_id", "valor");

-- CreateIndex
CREATE INDEX "pessoa_documento_pessoa_id_idx" ON "pessoa_documento"("pessoa_id");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_documento_tipo_valor_key" ON "pessoa_documento"("tipo", "valor");

-- CreateIndex
CREATE INDEX "pessoa_endereco_pessoa_id_idx" ON "pessoa_endereco"("pessoa_id");

-- CreateIndex
CREATE INDEX "pessoa_origem_ref_pessoa_id_idx" ON "pessoa_origem_ref"("pessoa_id");

-- CreateIndex
CREATE INDEX "pessoa_origem_ref_plataforma_origem_idx" ON "pessoa_origem_ref"("plataforma_origem");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_origem_ref_plataforma_origem_tipo_ref_valor_ref_key" ON "pessoa_origem_ref"("plataforma_origem", "tipo_ref", "valor_ref");

-- CreateIndex
CREATE INDEX "merge_pessoa_sobrevivente_id_idx" ON "merge_pessoa"("sobrevivente_id");

-- CreateIndex
CREATE INDEX "merge_pessoa_absorvida_id_idx" ON "merge_pessoa"("absorvida_id");

-- CreateIndex
CREATE INDEX "merge_conta_sobrevivente_id_idx" ON "merge_conta"("sobrevivente_id");

-- CreateIndex
CREATE INDEX "merge_conta_absorvida_id_idx" ON "merge_conta"("absorvida_id");

-- CreateIndex
CREATE INDEX "nota_reconciliacao_entidade_entidade_id_idx" ON "nota_reconciliacao"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "clientes_audit_entidade_entidade_id_idx" ON "clientes_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_merged_para_fkey" FOREIGN KEY ("merged_para") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta" ADD CONSTRAINT "conta_merged_para_fkey" FOREIGN KEY ("merged_para") REFERENCES "conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_email" ADD CONSTRAINT "pessoa_email_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_telefone" ADD CONSTRAINT "pessoa_telefone_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_documento" ADD CONSTRAINT "pessoa_documento_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_endereco" ADD CONSTRAINT "pessoa_endereco_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_origem_ref" ADD CONSTRAINT "pessoa_origem_ref_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
