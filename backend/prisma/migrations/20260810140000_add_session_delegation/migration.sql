-- Delegated battle-intent signing (§D).
--
-- §D requires the wallet, not a JWT, to authorize a battle, because a JWT is a bearer token
-- this server issues to itself. That rule stands: the delegated key is generated and held by
-- the client, so the operator still cannot forge an intent. The delegation only removes the
-- per-battle wallet prompt.
--
-- Not referenced by any receipt. Public replay never checks intent signatures, so this is an
-- authorization gate rather than evidence.
CREATE TABLE "session_delegation" (
    "delegation_hash" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "session_key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "not_before" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "revocation_nonce" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "signature_format" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "session_delegation_pkey" PRIMARY KEY ("delegation_hash")
);

-- CreateIndex
CREATE INDEX "session_delegation_chain_id_deployment_id_owner_idx" ON "session_delegation"("chain_id", "deployment_id", "owner");

-- Looked up by the recovered signer on every intent, so this is the hot path.
CREATE INDEX "session_delegation_chain_id_deployment_id_session_key_idx" ON "session_delegation"("chain_id", "deployment_id", "session_key");

-- EnableRowLevelSecurity
--
-- Required on every new table (see CLAUDE.md): Supabase's ALTER DEFAULT PRIVILEGES grants
-- each newly created table in `public` to `anon` and `authenticated` with ALL privileges, so
-- a table shipped without this is readable and deletable by anyone holding the project's
-- public anon key. Here that would mean reading which key may act for which wallet, and
-- deleting revocations.
--
-- Enabled with no policies, matching every other table: that denies the PostgREST roles
-- everything while the backend connects as the owner and bypasses RLS. Do NOT add FORCE.
ALTER TABLE "session_delegation" ENABLE ROW LEVEL SECURITY;
