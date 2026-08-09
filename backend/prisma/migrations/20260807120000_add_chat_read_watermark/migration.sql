-- How far each participant has read in a thread.
--
-- A watermark, not a per-message read flag: two rows per thread instead of two per
-- message, and "have they seen this one" is `message.id <= last_read_id`.
CREATE TABLE "chat_read" (
    "thread_id" TEXT NOT NULL,
    "participant" TEXT NOT NULL,
    "last_read_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_read_pkey" PRIMARY KEY ("thread_id", "participant")
);

ALTER TABLE "chat_read"
    ADD CONSTRAINT "chat_read_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "chat_thread"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase grants every newly created table to `anon` and `authenticated` through
-- ALTER DEFAULT PRIVILEGES, so without this the read state of every private conversation
-- is readable and deletable with the project's public key. RLS with no policy denies
-- those roles outright; the backend connects as the owner and bypasses it.
-- Deliberately not FORCE: that would apply the policy-less RLS to the owner too.
ALTER TABLE "chat_read" ENABLE ROW LEVEL SECURITY;
