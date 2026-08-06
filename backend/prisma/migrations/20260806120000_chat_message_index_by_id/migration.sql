-- The message page reads `WHERE thread_id = ? [AND id < ?] ORDER BY id DESC LIMIT n`.
-- The (thread_id, created_at) index could locate a thread's rows but not satisfy that
-- ordering, so every read sorted the whole thread to return one page. `id` is a SERIAL
-- and is already the ordering key the code uses, so this is a swap, not an addition.
DROP INDEX IF EXISTS "chat_message_thread_id_created_at_idx";

CREATE INDEX "chat_message_thread_id_id_idx" ON "chat_message"("thread_id", "id");
