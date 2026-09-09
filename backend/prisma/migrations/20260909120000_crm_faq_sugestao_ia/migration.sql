-- CreateEnum
CREATE TYPE "SugestaoIaTipo" AS ENUM ('RESPOSTA', 'CAMPO_PERSONALIZADO');

-- CreateEnum
CREATE TYPE "SugestaoIaStatus" AS ENUM ('PENDENTE', 'ACEITA', 'REJEITADA', 'SUBSTITUIDA');

-- AlterTable
ALTER TABLE "resposta_atendimento" ADD COLUMN     "sugestao_ia_id" UUID;

-- CreateTable
CREATE TABLE "faq_item" (
    "id" UUID NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_item_versao" (
    "id" UUID NOT NULL,
    "faq_item_id" UUID NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "autor_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_item_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sugestao_ia" (
    "id" UUID NOT NULL,
    "atendimento_id" UUID NOT NULL,
    "interacao_origem_id" UUID NOT NULL,
    "tipo" "SugestaoIaTipo" NOT NULL,
    "pergunta_detectada" TEXT,
    "faq_item_id" UUID,
    "campo_personalizado_lead_id" UUID,
    "campo_personalizado_pessoa_id" UUID,
    "conteudo_sugerido" TEXT NOT NULL,
    "conteudo_final" TEXT,
    "status" "SugestaoIaStatus" NOT NULL DEFAULT 'PENDENTE',
    "decidido_por_id" UUID,
    "decidido_em" TIMESTAMPTZ(6),
    "util" BOOLEAN,
    "util_registrado_por_id" UUID,
    "util_registrado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestao_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campo_personalizado_pessoa" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tipo" "CampoPersonalizadoTipo" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campo_personalizado_pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valor_campo_pessoa" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "definicao_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "valor_campo_pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faq_item_ativo_idx" ON "faq_item"("ativo");

-- CreateIndex
CREATE INDEX "faq_item_versao_faq_item_id_criado_em_idx" ON "faq_item_versao"("faq_item_id", "criado_em");

-- CreateIndex
CREATE INDEX "sugestao_ia_atendimento_id_criado_em_idx" ON "sugestao_ia"("atendimento_id", "criado_em");

-- CreateIndex
CREATE INDEX "sugestao_ia_interacao_origem_id_status_idx" ON "sugestao_ia"("interacao_origem_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campo_personalizado_pessoa_chave_key" ON "campo_personalizado_pessoa"("chave");

-- CreateIndex
CREATE INDEX "valor_campo_pessoa_definicao_id_idx" ON "valor_campo_pessoa"("definicao_id");

-- CreateIndex
CREATE UNIQUE INDEX "valor_campo_pessoa_pessoa_id_definicao_id_key" ON "valor_campo_pessoa"("pessoa_id", "definicao_id");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_atendimento_sugestao_ia_id_key" ON "resposta_atendimento"("sugestao_ia_id");

-- CHECK: exclusividade do alvo de sugestao_ia (tipo=CAMPO_PERSONALIZADO ->
-- exatamente um de campo_personalizado_lead_id/campo_personalizado_pessoa_id;
-- tipo=RESPOSTA -> nenhum dos dois). Prisma não modela CHECK (mesma
-- disciplina 007/009/010/012).
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_alvo_check" CHECK (
  (
    "tipo" = 'CAMPO_PERSONALIZADO'
    AND num_nonnulls("campo_personalizado_lead_id", "campo_personalizado_pessoa_id") = 1
  )
  OR (
    "tipo" = 'RESPOSTA'
    AND "campo_personalizado_lead_id" IS NULL
    AND "campo_personalizado_pessoa_id" IS NULL
  )
);

-- AddForeignKey
ALTER TABLE "resposta_atendimento" ADD CONSTRAINT "resposta_atendimento_sugestao_ia_id_fkey" FOREIGN KEY ("sugestao_ia_id") REFERENCES "sugestao_ia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_item" ADD CONSTRAINT "faq_item_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_item_versao" ADD CONSTRAINT "faq_item_versao_faq_item_id_fkey" FOREIGN KEY ("faq_item_id") REFERENCES "faq_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_item_versao" ADD CONSTRAINT "faq_item_versao_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_interacao_origem_id_fkey" FOREIGN KEY ("interacao_origem_id") REFERENCES "interacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_faq_item_id_fkey" FOREIGN KEY ("faq_item_id") REFERENCES "faq_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_campo_personalizado_lead_id_fkey" FOREIGN KEY ("campo_personalizado_lead_id") REFERENCES "campo_personalizado_lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_campo_personalizado_pessoa_id_fkey" FOREIGN KEY ("campo_personalizado_pessoa_id") REFERENCES "campo_personalizado_pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_ia" ADD CONSTRAINT "sugestao_ia_util_registrado_por_id_fkey" FOREIGN KEY ("util_registrado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_pessoa" ADD CONSTRAINT "valor_campo_pessoa_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_campo_pessoa" ADD CONSTRAINT "valor_campo_pessoa_definicao_id_fkey" FOREIGN KEY ("definicao_id") REFERENCES "campo_personalizado_pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

