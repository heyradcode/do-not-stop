-- CreateTable
CREATE TABLE "battle_room" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battle_room_chain_attacker_pet_id_defender_pet_id_idx" ON "battle_room"("chain", "attacker_pet_id", "defender_pet_id");
