-- CreateEnum
CREATE TYPE "EtapaPipelineTipo" AS ENUM ('ABERTA', 'GANHA', 'PERDIDA');

-- CreateEnum
CREATE TYPE "ModoAtribuicao" AS ENUM ('MANUAL', 'RODIZIO', 'REGRA');

-- CreateEnum
CREATE TYPE "RegraAtribuicaoCampo" AS ENUM ('ORIGEM', 'VALOR_ESTIMADO_MINIMO');

-- CreateTable
CREATE TABLE "pipeline" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "equipe_id" UUID,
    "modo_atribuicao" "ModoAtribuicao" NOT NULL DEFAULT 'MANUAL',
    "atribuicao_fallback" "ModoAtribuicao",
    "dias_esfriando" INTEGER,
    "ultimo_atribuido_usuario_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_pipeline" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" "EtapaPipelineTipo" NOT NULL,
    "sla_horas" INTEGER,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "etapa_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidade" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "pessoa_id" UUID,
    "lead_id" UUID,
    "titulo" TEXT NOT NULL,
    "valor_estimado_int" BIGINT NOT NULL,
    "valor_estimado_moeda" CHAR(3) NOT NULL,
    "responsavel_id" UUID,
    "data_prevista_fechamento" DATE,
    "entrou_etapa_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidade_movimentacao" (
    "id" UUID NOT NULL,
    "oportunidade_id" UUID NOT NULL,
    "etapa_anterior_id" UUID,
    "etapa_nova_id" UUID NOT NULL,
    "movido_por_id" UUID,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oportunidade_movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regra_atribuicao_pipeline" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "campo" "RegraAtribuicaoCampo" NOT NULL,
    "valor" JSONB NOT NULL,
    "responsavel_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "regra_atribuicao_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campo_personalizado_oportunidade" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tipo" "CampoPersonalizadoTipo" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campo_personalizado_oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valor_campo_oportunidade" (
    "id" UUID NOT NULL,
    "oportunidade_id" UUID NOT NULL,
    "definicao_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "valor_campo_oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_pipeline_audit" (
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

    CONSTRAINT "crm_pipeline_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_ativo_idx" ON "pipeline"("ativo");

-- CreateIndex
CREATE INDEX "etapa_pipeline_pipeline_id_tipo_idx" ON "etapa_pipeline"("pipeline_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_pipeline_pipeline_id_ordem_key" ON "etapa_pipeline"("pipeline_id", "ordem");

-- CreateIndex
CREATE INDEX "oportunidade_pipeline_id_etapa_id_idx" ON "oportunidade"("pipeline_id", "etapa_id");

-- CreateIndex
CREATE INDEX "oportunidade_responsavel_id_idx" ON "oportunidade"("responsavel_id");

-- CreateIndex
CREATE INDEX "oportunidade_pessoa_id_idx" ON "oportunidade"("pessoa_id");

-- CreateIndex
CREATE INDEX "oportunidade_lead_id_idx" ON "oportunidade"("lead_id");

-- CreateIndex
CREATE INDEX "oportunidade_movimentacao_oportunidade_id_criado_em_idx" ON "oportunidade_movimentacao"("oportunidade_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "regra_atribuicao_pipeline_pipeline_id_ordem_key" ON "regra_atribuicao_pipeline"("pipeline_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "campo_personalizado_oportunidade_chave_key" ON "campo_personalizado_oportunidade"("chave");

-- CreateIndex
CREATE INDEX "valor_campo_oportunidade_definicao_id_idx" ON "valor_campo_oportunidade"("definicao_id");

-- CreateIndex
CREATE UNIQUE INDEX "valor_campo_oportunidade_oportunidade_id_definicao_id_key" ON "valor_campo_oportunidade"("oportunidade_id", "definicao_id");

-- CreateIndex
CREATE INDEX "crm_pipeline_audit_entidade_entidade_id_idx" ON "crm_pipeline_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_ultimo_atribuido_usuario_id_fkey" FOREIGN KEY ("ultimo_atribuido_usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_pipeline" ADD CONSTRAINT "etapa_pipeline_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapa_pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_movimentacao" ADD CONSTRAINT "oportunidade_movimentacao_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_movimentacao" ADD CONSTRAINT "oportunidade_movimentacao_etapa_anterior_id_fkey" FOREIGN KEY ("etapa_anterior_id") REFERENCES "etapa_pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_movimentacao" ADD CONSTRAINT "oportunidade_movimentacao_etapa_nova_id_fkey" FOREIGN KEY ("etapa_nova_id") REFERENCES "etapa_pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_movimentacao" ADD CONSTRAINT "oportunidade_movimentacao_movido_por_id_fkey" FOREIGN KEY ("movido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_atribuicao_pipeline" ADD CONSTRAINT "regra_atribuicao_pipeline_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_atribuicao_pipeline" ADD CONSTRAINT "regra_atribuicao_pipeline_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_oportunidade" ADD CONSTRAINT "valor_campo_oportunidade_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_oportunidade" ADD CONSTRAINT "valor_campo_oportunidade_definicao_id_fkey" FOREIGN KEY ("definicao_id") REFERENCES "campo_personalizado_oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Âncora exclusiva de `oportunidade` (D-01, mesmo padrão da `interacao` na 009):
-- exatamente um de pessoa_id/lead_id preenchido. Prisma não modela CHECK.
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_ancora_check"
  CHECK (num_nonnulls("pessoa_id", "lead_id") = 1);
