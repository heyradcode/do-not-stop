-- CreateTable
CREATE TABLE "battle_conversation" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "battle_id" TEXT,
    "phase" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battle_conversation_chain_attacker_pet_id_defender_pet_id_idx" ON "battle_conversation"("chain", "attacker_pet_id", "defender_pet_id");
