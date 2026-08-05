-- CreateTable
CREATE TABLE "reward_season" (
    "season_id" INTEGER NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "first_sequence" BIGINT NOT NULL,
    "last_sequence" BIGINT NOT NULL,
    "distributor" TEXT NOT NULL,
    "evm_chain_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "total_amount" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_tx_hash" TEXT,
    "opened_at" TIMESTAMP(3),

    CONSTRAINT "reward_season_pkey" PRIMARY KEY ("season_id")
);

-- CreateTable
CREATE TABLE "reward_entitlement" (
    "season_id" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "leaf_index" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "reward_entitlement_pkey" PRIMARY KEY ("season_id","wallet")
);

-- CreateIndex
CREATE INDEX "reward_season_chain_id_deployment_id_idx" ON "reward_season"("chain_id", "deployment_id");

-- CreateIndex
CREATE INDEX "reward_entitlement_season_id_leaf_index_idx" ON "reward_entitlement"("season_id", "leaf_index");

-- AddForeignKey
ALTER TABLE "reward_entitlement" ADD CONSTRAINT "reward_entitlement_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "reward_season"("season_id") ON DELETE CASCADE ON UPDATE CASCADE;
