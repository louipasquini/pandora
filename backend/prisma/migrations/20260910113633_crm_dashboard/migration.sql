-- CreateEnum
CREATE TYPE "MetaComercialPeriodo" AS ENUM ('MES', 'TRIMESTRE');

-- CreateTable
CREATE TABLE "meta_comercial" (
    "id" UUID NOT NULL,
    "metrica" TEXT NOT NULL,
    "periodo" "MetaComercialPeriodo" NOT NULL,
    "referencia" DATE NOT NULL,
    "alvo_int" BIGINT NOT NULL,
    "alvo_moeda" CHAR(3),
    "equipe_id" UUID,
    "responsavel_id" UUID,
    "descricao" TEXT,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meta_comercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_visao" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "filtros" JSONB NOT NULL,
    "paineis" JSONB NOT NULL,
    "dono_usuario_id" UUID NOT NULL,
    "perfil_compartilhado_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_visao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_dashboard_audit" (
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

    CONSTRAINT "crm_dashboard_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_comercial_periodo_referencia_idx" ON "meta_comercial"("periodo", "referencia");

-- CreateIndex
CREATE INDEX "meta_comercial_equipe_id_idx" ON "meta_comercial"("equipe_id");

-- CreateIndex
CREATE INDEX "meta_comercial_responsavel_id_idx" ON "meta_comercial"("responsavel_id");

-- CreateIndex
CREATE INDEX "dashboard_visao_dono_usuario_id_idx" ON "dashboard_visao"("dono_usuario_id");

-- CreateIndex
CREATE INDEX "dashboard_visao_perfil_compartilhado_id_idx" ON "dashboard_visao"("perfil_compartilhado_id");

-- CreateIndex
CREATE INDEX "crm_dashboard_audit_entidade_entidade_id_idx" ON "crm_dashboard_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "meta_comercial" ADD CONSTRAINT "meta_comercial_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_comercial" ADD CONSTRAINT "meta_comercial_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_comercial" ADD CONSTRAINT "meta_comercial_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_visao" ADD CONSTRAINT "dashboard_visao_dono_usuario_id_fkey" FOREIGN KEY ("dono_usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_visao" ADD CONSTRAINT "dashboard_visao_perfil_compartilhado_id_fkey" FOREIGN KEY ("perfil_compartilhado_id") REFERENCES "perfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
