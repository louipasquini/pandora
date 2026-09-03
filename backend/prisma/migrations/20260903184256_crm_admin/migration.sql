-- CreateEnum
CREATE TYPE "EquipeTipo" AS ENUM ('COMERCIAL', 'ATENDIMENTO', 'CS');

-- CreateEnum
CREATE TYPE "PapelEquipe" AS ENUM ('LIDER', 'MEMBRO');

-- CreateEnum
CREATE TYPE "IntegracaoTipo" AS ENUM ('API_KEY', 'WEBHOOK', 'CONEXAO_INTERNA');

-- CreateEnum
CREATE TYPE "IntegracaoAlvo" AS ENUM ('FINANCEIRO', 'MARKETING', 'CENTRAL', 'EXTERNO');

-- CreateTable
CREATE TABLE "equipe" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "EquipeTipo" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipe_membro" (
    "id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "papel" "PapelEquipe" NOT NULL,
    "entrou_em" TIMESTAMPTZ(6) NOT NULL,
    "saiu_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipe_membro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "janela_atendimento" (
    "id" UUID NOT NULL,
    "equipe_id" UUID,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio" INTEGER NOT NULL,
    "hora_fim" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "janela_atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriado" (
    "id" UUID NOT NULL,
    "equipe_id" UUID,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "recorrente_anual" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "IntegracaoTipo" NOT NULL,
    "alvo" "IntegracaoAlvo" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "segredo_cifrado" TEXT,
    "segredo_hash" TEXT,
    "segredo_ultimos4" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_uso_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_admin_audit" (
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

    CONSTRAINT "crm_admin_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipe_ativo_idx" ON "equipe"("ativo");

-- CreateIndex
CREATE INDEX "equipe_membro_usuario_id_idx" ON "equipe_membro"("usuario_id");

-- CreateIndex
CREATE INDEX "equipe_membro_equipe_id_saiu_em_idx" ON "equipe_membro"("equipe_id", "saiu_em");

-- CreateIndex
CREATE INDEX "janela_atendimento_equipe_id_dia_semana_ativo_idx" ON "janela_atendimento"("equipe_id", "dia_semana", "ativo");

-- CreateIndex
CREATE INDEX "feriado_equipe_id_idx" ON "feriado"("equipe_id");

-- CreateIndex
CREATE INDEX "integracao_tipo_idx" ON "integracao"("tipo");

-- CreateIndex
CREATE INDEX "integracao_alvo_idx" ON "integracao"("alvo");

-- CreateIndex
CREATE INDEX "integracao_ativo_idx" ON "integracao"("ativo");

-- CreateIndex
CREATE INDEX "crm_admin_audit_entidade_entidade_id_idx" ON "crm_admin_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "equipe_membro" ADD CONSTRAINT "equipe_membro_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipe_membro" ADD CONSTRAINT "equipe_membro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "janela_atendimento" ADD CONSTRAINT "janela_atendimento_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado" ADD CONSTRAINT "feriado_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
