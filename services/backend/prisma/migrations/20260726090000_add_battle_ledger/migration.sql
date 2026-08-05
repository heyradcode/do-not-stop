-- CreateEnum
CREATE TYPE "battle_state" AS ENUM ('accepted', 'committed', 'seeded', 'computed', 'verified', 'signed', 'published', 'batched', 'rejected', 'expired', 'verification_failed', 'signing_failed', 'forfeited');

-- CreateTable
CREATE TABLE "battle_intent" (
    "intent_hash" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "attacker_owner" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_owner" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "challenge_id" TEXT,
    "client_nonce" TEXT NOT NULL,
    "ruleset_hash" TEXT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "signature" TEXT NOT NULL,
    "signature_format" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "battle_intent_pkey" PRIMARY KEY ("intent_hash")
);

-- CreateTable
CREATE TABLE "defense_authorization" (
    "authorization_hash" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "defender_owner" TEXT NOT NULL,
    "all_pets" BOOLEAN NOT NULL,
    "pet_ids" JSONB NOT NULL,
    "ruleset_hash" TEXT NOT NULL,
    "min_level" INTEGER NOT NULL,
    "max_level" INTEGER NOT NULL,
    "max_battles_per_day" INTEGER NOT NULL,
    "not_before" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "revocation_nonce" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "signature_format" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "defense_authorization_pkey" PRIMARY KEY ("authorization_hash")
);

-- CreateTable
CREATE TABLE "battle_ledger" (
    "battle_id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "state" "battle_state" NOT NULL,
    "failure_reason" TEXT,
    "intent_hash" TEXT NOT NULL,
    "authorization_hash" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "attacker_owner" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "defender_owner" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "ruleset_hash" TEXT NOT NULL,
    "ruleset_version" INTEGER NOT NULL,
    "drand_chain_hash" TEXT NOT NULL,
    "drand_round" BIGINT NOT NULL,
    "accepted_at" BIGINT NOT NULL,
    "beacon_signature" TEXT,
    "beacon_randomness" TEXT,
    "seed" TEXT,
    "attacker_won" BOOLEAN,
    "rounds" INTEGER,
    "winner_hp_remaining" INTEGER,
    "combat_log" JSONB,
    "combat_log_hash" TEXT,
    "progression" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battle_ledger_pkey" PRIMARY KEY ("battle_id")
);

-- CreateTable
CREATE TABLE "pet_battle_lock" (
    "chain_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_battle_lock_pkey" PRIMARY KEY ("chain_id","pet_id")
);

-- CreateTable
CREATE TABLE "battle_commitment" (
    "commitment_hash" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "previous_commitment_hash" TEXT,
    "signing_key_id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "accepted_at" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "battle_commitment_pkey" PRIMARY KEY ("commitment_hash")
);

-- CreateTable
CREATE TABLE "battle_receipt" (
    "receipt_hash" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "attacker_pet_id" TEXT NOT NULL,
    "defender_pet_id" TEXT NOT NULL,
    "signing_key_id" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "previous_receipt_hash" TEXT,
    "attacker_previous_receipt_hash" TEXT,
    "defender_previous_receipt_hash" TEXT,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "stored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_id" TEXT,

    CONSTRAINT "battle_receipt_pkey" PRIMARY KEY ("receipt_hash")
);

-- CreateTable
CREATE TABLE "battle_batch" (
    "id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "batch_number" BIGINT NOT NULL,
    "previous_root" TEXT,
    "merkle_root" TEXT NOT NULL,
    "ruleset_set_hash" TEXT NOT NULL,
    "first_sequence" BIGINT NOT NULL,
    "last_sequence" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchored_tx_hash" TEXT,
    "anchored_at" TIMESTAMP(3),

    CONSTRAINT "battle_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_ruleset" (
    "ruleset_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "engine_id" TEXT NOT NULL,
    "engine_version" INTEGER NOT NULL,
    "bundle" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMP(3),

    CONSTRAINT "battle_ruleset_pkey" PRIMARY KEY ("ruleset_hash")
);

-- CreateTable
CREATE TABLE "pet_battle_progress" (
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "last_opponent_id" TEXT NOT NULL DEFAULT '0',
    "streak" INTEGER NOT NULL DEFAULT 0,
    "win_count" INTEGER NOT NULL DEFAULT 0,
    "loss_count" INTEGER NOT NULL DEFAULT 0,
    "ready_at" BIGINT NOT NULL DEFAULT 0,
    "last_receipt_hash" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_battle_progress_pkey" PRIMARY KEY ("chain_id","deployment_id","pet_id")
);

-- CreateTable
CREATE TABLE "battle_outbox" (
    "id" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "processed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battle_intent_chain_id_deployment_id_attacker_owner_idx" ON "battle_intent"("chain_id", "deployment_id", "attacker_owner");

-- CreateIndex
CREATE UNIQUE INDEX "battle_intent_chain_id_deployment_id_attacker_owner_client__key" ON "battle_intent"("chain_id", "deployment_id", "attacker_owner", "client_nonce");

-- CreateIndex
CREATE INDEX "defense_authorization_chain_id_deployment_id_defender_owner_idx" ON "defense_authorization"("chain_id", "deployment_id", "defender_owner");

-- CreateIndex
CREATE INDEX "defense_authorization_chain_id_deployment_id_ruleset_hash_idx" ON "defense_authorization"("chain_id", "deployment_id", "ruleset_hash");

-- CreateIndex
CREATE UNIQUE INDEX "battle_ledger_intent_hash_key" ON "battle_ledger"("intent_hash");

-- CreateIndex
CREATE INDEX "battle_ledger_chain_id_deployment_id_state_idx" ON "battle_ledger"("chain_id", "deployment_id", "state");

-- CreateIndex
CREATE INDEX "battle_ledger_chain_id_attacker_pet_id_idx" ON "battle_ledger"("chain_id", "attacker_pet_id");

-- CreateIndex
CREATE INDEX "battle_ledger_chain_id_defender_pet_id_idx" ON "battle_ledger"("chain_id", "defender_pet_id");

-- CreateIndex
CREATE INDEX "battle_ledger_drand_chain_hash_drand_round_idx" ON "battle_ledger"("drand_chain_hash", "drand_round");

-- CreateIndex
CREATE INDEX "pet_battle_lock_battle_id_idx" ON "pet_battle_lock"("battle_id");

-- CreateIndex
CREATE UNIQUE INDEX "battle_commitment_battle_id_key" ON "battle_commitment"("battle_id");

-- CreateIndex
CREATE INDEX "battle_commitment_signing_key_id_created_at_idx" ON "battle_commitment"("signing_key_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "battle_commitment_signing_key_id_sequence_key" ON "battle_commitment"("signing_key_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "battle_receipt_battle_id_key" ON "battle_receipt"("battle_id");

-- CreateIndex
CREATE INDEX "battle_receipt_chain_id_attacker_pet_id_idx" ON "battle_receipt"("chain_id", "attacker_pet_id");

-- CreateIndex
CREATE INDEX "battle_receipt_chain_id_defender_pet_id_idx" ON "battle_receipt"("chain_id", "defender_pet_id");

-- CreateIndex
CREATE INDEX "battle_receipt_batch_id_idx" ON "battle_receipt"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "battle_receipt_signing_key_id_sequence_key" ON "battle_receipt"("signing_key_id", "sequence");

-- CreateIndex
CREATE INDEX "battle_batch_chain_id_deployment_id_anchored_at_idx" ON "battle_batch"("chain_id", "deployment_id", "anchored_at");

-- CreateIndex
CREATE UNIQUE INDEX "battle_batch_chain_id_deployment_id_batch_number_key" ON "battle_batch"("chain_id", "deployment_id", "batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "battle_ruleset_version_key" ON "battle_ruleset"("version");

-- CreateIndex
CREATE INDEX "pet_battle_progress_chain_id_deployment_id_ready_at_idx" ON "pet_battle_progress"("chain_id", "deployment_id", "ready_at");

-- CreateIndex
CREATE INDEX "battle_outbox_processed_at_available_at_idx" ON "battle_outbox"("processed_at", "available_at");

-- CreateIndex
CREATE INDEX "battle_outbox_battle_id_idx" ON "battle_outbox"("battle_id");

-- CreateIndex
CREATE INDEX "battle_outbox_topic_processed_at_idx" ON "battle_outbox"("topic", "processed_at");

-- AddForeignKey
ALTER TABLE "battle_ledger" ADD CONSTRAINT "battle_ledger_intent_hash_fkey" FOREIGN KEY ("intent_hash") REFERENCES "battle_intent"("intent_hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_ledger" ADD CONSTRAINT "battle_ledger_authorization_hash_fkey" FOREIGN KEY ("authorization_hash") REFERENCES "defense_authorization"("authorization_hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_battle_lock" ADD CONSTRAINT "pet_battle_lock_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battle_ledger"("battle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_commitment" ADD CONSTRAINT "battle_commitment_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battle_ledger"("battle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_receipt" ADD CONSTRAINT "battle_receipt_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battle_ledger"("battle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_receipt" ADD CONSTRAINT "battle_receipt_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "battle_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_outbox" ADD CONSTRAINT "battle_outbox_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battle_ledger"("battle_id") ON DELETE CASCADE ON UPDATE CASCADE;
