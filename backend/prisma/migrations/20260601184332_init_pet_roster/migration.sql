-- CreateTable
CREATE TABLE "pet_roster" (
    "chain" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rarity" INTEGER NOT NULL,
    "dna" TEXT NOT NULL,
    "win_count" INTEGER NOT NULL,
    "loss_count" INTEGER NOT NULL,
    "ready_at" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_roster_pkey" PRIMARY KEY ("chain","pet_id")
);

-- CreateIndex
CREATE INDEX "pet_roster_chain_owner_idx" ON "pet_roster"("chain", "owner");

-- CreateIndex
CREATE INDEX "pet_roster_chain_ready_at_idx" ON "pet_roster"("chain", "ready_at");
