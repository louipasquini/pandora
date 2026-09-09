-- CreateEnum
CREATE TYPE "FluxoGatilhoTipo" AS ENUM ('LEAD_CRIADO', 'LEAD_ESTAGIO_MUDOU', 'OPORTUNIDADE_ETAPA_MUDOU', 'INTERACAO_REGISTRADA', 'TAG_APLICADA', 'EVENTO_EXTERNO');

-- CreateEnum
CREATE TYPE "FluxoVersaoStatus" AS ENUM ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "FluxoRegistroTipo" AS ENUM ('LEAD', 'OPORTUNIDADE');

-- CreateEnum
CREATE TYPE "FluxoExecucaoResultado" AS ENUM ('EXECUTADA', 'CONDICAO_NAO_SATISFEITA', 'FALHOU');

-- CreateTable
CREATE TABLE "fluxo_automacao" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criado_por" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fluxo_automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxo_automacao_versao" (
    "id" UUID NOT NULL,
    "fluxo_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "FluxoVersaoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "gatilho_tipo" "FluxoGatilhoTipo" NOT NULL,
    "condicoes" JSONB NOT NULL,
    "acoes" JSONB NOT NULL,
    "autor" TEXT,
    "publicado_por" TEXT,
    "publicado_em" TIMESTAMPTZ(6),
    "arquivado_por" TEXT,
    "arquivado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fluxo_automacao_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucao_fluxo" (
    "id" UUID NOT NULL,
    "fluxo_versao_id" UUID NOT NULL,
    "fonte" "FluxoGatilhoTipo" NOT NULL,
    "fonte_registro_id" UUID NOT NULL,
    "registro_tipo" "FluxoRegistroTipo" NOT NULL,
    "registro_id" UUID NOT NULL,
    "resultado" "FluxoExecucaoResultado" NOT NULL,
    "acoes_aplicadas" JSONB NOT NULL,
    "erro_detalhe" TEXT,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execucao_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxo_modelo" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "gatilho_tipo" "FluxoGatilhoTipo" NOT NULL,
    "condicoes" JSONB NOT NULL,
    "acoes" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluxo_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxo_cursor_fonte" (
    "fonte" "FluxoGatilhoTipo" NOT NULL,
    "ultimo_criado_em" TIMESTAMPTZ(6) NOT NULL,
    "ultimo_id" UUID NOT NULL,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fluxo_cursor_fonte_pkey" PRIMARY KEY ("fonte")
);

-- CreateIndex
CREATE INDEX "fluxo_automacao_versao_fluxo_id_status_idx" ON "fluxo_automacao_versao"("fluxo_id", "status");

-- CreateIndex
CREATE INDEX "fluxo_automacao_versao_gatilho_tipo_status_idx" ON "fluxo_automacao_versao"("gatilho_tipo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fluxo_automacao_versao_fluxo_id_numero_key" ON "fluxo_automacao_versao"("fluxo_id", "numero");

-- CreateIndex
CREATE INDEX "execucao_fluxo_registro_tipo_registro_id_criado_em_idx" ON "execucao_fluxo"("registro_tipo", "registro_id", "criado_em");

-- CreateIndex
CREATE INDEX "execucao_fluxo_fluxo_versao_id_criado_em_idx" ON "execucao_fluxo"("fluxo_versao_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "execucao_fluxo_fluxo_versao_id_fonte_fonte_registro_id_key" ON "execucao_fluxo"("fluxo_versao_id", "fonte", "fonte_registro_id");

-- AddForeignKey
ALTER TABLE "fluxo_automacao_versao" ADD CONSTRAINT "fluxo_automacao_versao_fluxo_id_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxo_automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_fluxo_versao_id_fkey" FOREIGN KEY ("fluxo_versao_id") REFERENCES "fluxo_automacao_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spec 014, D-01: no máximo 1 versão PUBLICADA por fluxo — índice único
-- PARCIAL (Prisma não modela índice parcial, mesmo padrão 007/008/009/010/012).
CREATE UNIQUE INDEX "fluxo_automacao_versao_publicada_unica" ON "fluxo_automacao_versao"("fluxo_id") WHERE "status" = 'PUBLICADA';
