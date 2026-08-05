-- Monotonic source version (Solana slot / EVM block timestamp) so the
-- StreamLiveBattles gRPC replay can resume from a per-chain cursor.
-- Default 0: rows recorded by the dialogue path (client-reported) sort
-- before any chain-indexed row and are never replayed.
ALTER TABLE "battle_history" ADD COLUMN "version" BIGINT NOT NULL DEFAULT 0;

-- Replay query: WHERE chain = $1 AND version > $2 ORDER BY version.
CREATE INDEX "battle_history_chain_version_idx" ON "battle_history"("chain", "version");
