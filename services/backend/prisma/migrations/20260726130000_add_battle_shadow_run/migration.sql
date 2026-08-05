-- CreateTable
CREATE TABLE "battle_shadow_run" (
    "chain_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "predicted" JSONB NOT NULL,
    "go_verdict" JSONB,
    "observed" JSONB,
    "mismatches" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "predicted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observed_at" TIMESTAMP(3),

    CONSTRAINT "battle_shadow_run_pkey" PRIMARY KEY ("chain_id","request_id")
);

-- CreateIndex
CREATE INDEX "battle_shadow_run_status_predicted_at_idx" ON "battle_shadow_run"("status", "predicted_at");

