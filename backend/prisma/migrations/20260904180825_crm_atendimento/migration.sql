-- CreateEnum
CREATE TYPE "AtendimentoCanal" AS ENUM ('WHATSAPP', 'MANUAL');

-- CreateEnum
CREATE TYPE "AtendimentoStatus" AS ENUM ('AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "AtendimentoPrioridade" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- AlterTable
ALTER TABLE "equipe" ADD COLUMN     "mensagem_fora_expediente" TEXT,
ADD COLUMN     "sla_primeira_resposta_minutos" INTEGER;

-- AlterTable
ALTER TABLE "interacao" ADD COLUMN     "atendimento_id" UUID;

-- CreateTable
CREATE TABLE "atendimento" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID,
    "lead_id" UUID,
    "canal" "AtendimentoCanal" NOT NULL,
    "canal_whatsapp_id" UUID,
    "equipe_id" UUID,
    "atendente_atual_id" UUID,
    "status" "AtendimentoStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "prioridade" "AtendimentoPrioridade" NOT NULL DEFAULT 'NORMAL',
    "aberto_em" TIMESTAMPTZ(6) NOT NULL,
    "primeira_resposta_em" TIMESTAMPTZ(6),
    "sla_minutos" INTEGER NOT NULL,
    "encerrado_em" TIMESTAMPTZ(6),
    "encerrado_por_id" UUID,
    "motivo_encerramento" TEXT,
    "csat_solicitado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencia_atendimento" (
    "id" UUID NOT NULL,
    "atendimento_id" UUID NOT NULL,
    "de_atendente_id" UUID,
    "para_atendente_id" UUID,
    "de_equipe_id" UUID,
    "para_equipe_id" UUID,
    "transferido_por_id" UUID,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencia_atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta_atendimento" (
    "id" UUID NOT NULL,
    "atendimento_id" UUID NOT NULL,
    "interacao_id" UUID NOT NULL,
    "atendente_id" UUID NOT NULL,
    "via_ia" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resposta_atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atendimento_status_prioridade_aberto_em_idx" ON "atendimento"("status", "prioridade", "aberto_em");

-- CreateIndex
CREATE INDEX "atendimento_atendente_atual_id_status_idx" ON "atendimento"("atendente_atual_id", "status");

-- CreateIndex
CREATE INDEX "atendimento_equipe_id_status_idx" ON "atendimento"("equipe_id", "status");

-- CreateIndex
CREATE INDEX "atendimento_pessoa_id_idx" ON "atendimento"("pessoa_id");

-- CreateIndex
CREATE INDEX "atendimento_lead_id_idx" ON "atendimento"("lead_id");

-- CreateIndex
CREATE INDEX "transferencia_atendimento_atendimento_id_criado_em_idx" ON "transferencia_atendimento"("atendimento_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_atendimento_interacao_id_key" ON "resposta_atendimento"("interacao_id");

-- CreateIndex
CREATE INDEX "resposta_atendimento_atendimento_id_criado_em_idx" ON "resposta_atendimento"("atendimento_id", "criado_em");

-- CreateIndex
CREATE INDEX "interacao_atendimento_id_ocorrido_em_idx" ON "interacao"("atendimento_id", "ocorrido_em");

-- CHECK: âncora exclusiva (pessoa_id XOR lead_id) — mesma disciplina de
-- `interacao`/`oportunidade` (specs 009/010). Prisma não modela CHECK.
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_ancora_check" CHECK (num_nonnulls("pessoa_id", "lead_id") = 1);

-- AddForeignKey
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_canal_whatsapp_id_fkey" FOREIGN KEY ("canal_whatsapp_id") REFERENCES "canal_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_atendente_atual_id_fkey" FOREIGN KEY ("atendente_atual_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_encerrado_por_id_fkey" FOREIGN KEY ("encerrado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_de_atendente_id_fkey" FOREIGN KEY ("de_atendente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_para_atendente_id_fkey" FOREIGN KEY ("para_atendente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_de_equipe_id_fkey" FOREIGN KEY ("de_equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_para_equipe_id_fkey" FOREIGN KEY ("para_equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_atendimento" ADD CONSTRAINT "transferencia_atendimento_transferido_por_id_fkey" FOREIGN KEY ("transferido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_atendimento" ADD CONSTRAINT "resposta_atendimento_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_atendimento" ADD CONSTRAINT "resposta_atendimento_interacao_id_fkey" FOREIGN KEY ("interacao_id") REFERENCES "interacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_atendimento" ADD CONSTRAINT "resposta_atendimento_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
