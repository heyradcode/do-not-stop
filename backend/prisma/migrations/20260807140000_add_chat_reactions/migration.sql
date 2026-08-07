-- One participant's reaction to one message.
--
-- The primary key is the rule, not a convenience: a person holds at most one reaction per
-- message, so reacting again replaces it and reacting with the same emoji removes it.
CREATE TABLE "chat_reaction" (
    "message_id" INTEGER NOT NULL,
    "participant" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reaction_pkey" PRIMARY KEY ("message_id", "participant")
);

ALTER TABLE "chat_reaction"
    ADD CONSTRAINT "chat_reaction_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "chat_message"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase grants every newly created table to `anon` and `authenticated` through
-- ALTER DEFAULT PRIVILEGES, so without this anyone holding the project's public key could
-- read and delete the reactions on every private conversation. RLS with no policy denies
-- those roles outright; the backend connects as the owner and bypasses it.
-- Deliberately not FORCE: that would apply the policy-less RLS to the owner too.
ALTER TABLE "chat_reaction" ENABLE ROW LEVEL SECURITY;
