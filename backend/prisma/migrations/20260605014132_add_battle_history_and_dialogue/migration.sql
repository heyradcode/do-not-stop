-- CreateTable
CREATE TABLE "battle_history" (
    "chain" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "winner_pet_id" TEXT NOT NULL,
    "fought_at" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_history_pkey" PRIMARY KEY ("chain","battle_id")
);

-- CreateTable
CREATE TABLE "battle_dialogue" (
    "chain" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "turns" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_dialogue_pkey" PRIMARY KEY ("chain","battle_id")
);

-- CreateIndex
CREATE INDEX "battle_history_chain_attacker_pet_id_idx" ON "battle_history"("chain", "attacker_pet_id");

-- CreateIndex
CREATE INDEX "battle_history_chain_defender_pet_id_idx" ON "battle_history"("chain", "defender_pet_id");
