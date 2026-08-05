-- CreateTable
CREATE TABLE "defense_usage" (
    "authorization_hash" TEXT NOT NULL,
    "day_bucket" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defense_usage_pkey" PRIMARY KEY ("authorization_hash","day_bucket")
);

-- CreateIndex
CREATE INDEX "defense_authorization_owner_nonce_idx" ON "defense_authorization"("chain_id", "deployment_id", "defender_owner", "revocation_nonce");

-- AddForeignKey
ALTER TABLE "defense_usage" ADD CONSTRAINT "defense_usage_authorization_hash_fkey" FOREIGN KEY ("authorization_hash") REFERENCES "defense_authorization"("authorization_hash") ON DELETE CASCADE ON UPDATE CASCADE;
