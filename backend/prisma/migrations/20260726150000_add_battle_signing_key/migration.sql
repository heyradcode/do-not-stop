-- CreateTable
CREATE TABLE "battle_signing_key" (
    "key_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "not_before" BIGINT NOT NULL,
    "not_after" BIGINT,
    "compromised" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_signing_key_pkey" PRIMARY KEY ("key_id")
);
