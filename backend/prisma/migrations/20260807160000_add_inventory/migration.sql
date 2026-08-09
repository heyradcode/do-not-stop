-- CreateTable
CREATE TABLE "item_definition" (
    "item_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slot" INTEGER,
    "rarity" INTEGER NOT NULL,
    "effect" JSONB,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "item_definition_pkey" PRIMARY KEY ("item_type")
);

-- CreateTable
CREATE TABLE "item_roster" (
    "chain" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "last_version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_roster_pkey" PRIMARY KEY ("chain","owner","item_type")
);

-- CreateTable
CREATE TABLE "pet_equipment" (
    "chain" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "last_version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_equipment_pkey" PRIMARY KEY ("chain","pet_id","slot")
);

-- CreateTable
CREATE TABLE "item_entitlement" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_definition_key_key" ON "item_definition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "item_entitlement_source_ref_owner_item_type_key" ON "item_entitlement"("source_ref", "owner", "item_type");

-- CreateIndex
CREATE INDEX "item_entitlement_chain_owner_claimed_at_idx" ON "item_entitlement"("chain", "owner", "claimed_at");

-- EnableRowLevelSecurity
--
-- Prisma emits no RLS statements, and on Supabase `ALTER DEFAULT PRIVILEGES` grants every
-- newly created table in `public` to `anon` and `authenticated` with ALL privileges —
-- including DELETE and TRUNCATE. So a table shipped without this line is readable and
-- writable by anyone holding the project's public anon key. Here that would mean anyone
-- being able to grant themselves items, or delete the equipment a battle snapshot is about
-- to be built from.
--
-- Enabled with no policies, matching every other table in this database: that denies all
-- access to the PostgREST roles, while the backend connects as the table owner
-- (`postgres`) and owners bypass RLS unless FORCE is set. indexer-go connects on the same
-- URL and is unaffected for the same reason. Do NOT add FORCE here — it would apply these
-- policy-less tables to the owner too and deny both services everything.
ALTER TABLE "item_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_roster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pet_equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_entitlement" ENABLE ROW LEVEL SECURITY;
