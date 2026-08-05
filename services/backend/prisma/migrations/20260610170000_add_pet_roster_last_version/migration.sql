-- Monotonic source version (Solana slot / subgraph updatedAt) used by
-- indexer-go's version-guarded upserts to discard stale roster writes.
-- Default 0 so rows written by the Node indexer (which does not set it)
-- always yield to chain-sourced writes.
ALTER TABLE "pet_roster" ADD COLUMN "last_version" BIGINT NOT NULL DEFAULT 0;
