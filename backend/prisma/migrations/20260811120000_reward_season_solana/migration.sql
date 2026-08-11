-- Reward seasons for Solana as well as EVM.
--
-- A season is per chain and always was: `chain_id` scopes it, and the distributor and token
-- are necessarily one chain's contract and one chain's asset. What was EVM-only is how the
-- leaf binds the chain. EVM uses a numeric chain id; Solana has no `block.chainid`, so its
-- leaves bind the cluster's 32-byte genesis hash instead.
--
-- Both columns are therefore nullable and exactly one is set per season, decided by the
-- family of `chain_id`. Existing rows are EVM seasons and keep their `evm_chain_id`.
--
-- Season ids stay globally unique rather than per chain. Nothing on chain requires a
-- program's seasons to start at 1, so allocating them from one sequence across both chains
-- costs nothing and avoids changing this table's primary key and the entitlement foreign key
-- that depends on it.

ALTER TABLE "reward_season" ALTER COLUMN "evm_chain_id" DROP NOT NULL;

ALTER TABLE "reward_season" ADD COLUMN "chain_ref" TEXT;

-- No RLS statement: this migration creates no table. `reward_season` already has row level
-- security enabled with zero policies, which is what denies the PostgREST roles while the
-- backend connects as the owner and bypasses it.
