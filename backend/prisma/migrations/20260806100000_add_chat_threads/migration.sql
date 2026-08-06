-- CreateTable
CREATE TABLE "chat_thread" (
    "id" TEXT NOT NULL,
    "participant_a" TEXT NOT NULL,
    "participant_b" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" SERIAL NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_thread_participant_a_participant_b_key" ON "chat_thread"("participant_a", "participant_b");

-- CreateIndex
CREATE INDEX "chat_thread_participant_a_idx" ON "chat_thread"("participant_a");

-- CreateIndex
CREATE INDEX "chat_thread_participant_b_idx" ON "chat_thread"("participant_b");

-- CreateIndex
CREATE INDEX "chat_message_thread_id_created_at_idx" ON "chat_message"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
