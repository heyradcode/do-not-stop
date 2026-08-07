import { normalizeAccount } from '@cryptopets/protocol';
import { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { ownerKey } from './owner.sql';
import { chainOfAccount, type Chain } from '@typings/chain';

/**
 * Read/write access for private chat (roadmap §2 v1), plus the marriage lookup that
 * gates it.
 *
 * The gate lives here rather than in `roster.repository.ts` because it is a chat
 * question asked of roster data, and `roster.repository.ts` is deliberately kept as the
 * unmerged projection two battle callers depend on.
 */

/** One current marriage involving the caller, from the caller's side. */
export interface MarriedCounterpart {
    chain: Chain;
    /** The caller's married pet. `dna` is what a client derives its art and emoji from. */
    petId: string;
    petName: string;
    petDna: string;
    /** The spouse pet, and the wallet that owns it. */
    spousePetId: string;
    spouseName: string;
    spouseDna: string;
    counterpart: string;
}

/**
 * The roster-side marriage predicate for one caller: their pets, joined to each spouse
 * pet, excluding pairs they own both sides of.
 *
 * A pet married to another of the caller's own pets is a marriage but not a
 * conversation — there is no second person to talk to.
 */
function marriedPairs(caller: string): { chain: Chain; where: Prisma.Sql } {
    const chain = chainOfAccount(caller);
    return {
        chain,
        where: Prisma.sql`
            FROM pet_roster p
            JOIN pet_roster s
              ON s.chain = p.chain
             AND s.pet_id = p.spouse_id
            WHERE p.chain = ${chain}
              AND ${ownerKey(chain, 'p')} = ${normalizeAccount(caller)}
              AND p.spouse_id <> '0'
              AND s.owner <> p.owner
        `,
    };
}

/**
 * Every wallet the caller is currently married to, one row per married pet pair.
 *
 * The caller is normalized and the chain derived from its shape, so the comparison
 * matches how indexer-go wrote the roster regardless of the case it used. An owner pair
 * can appear more than once (two of their pets married to each other's); the caller
 * collapses that into one thread per pair.
 */
export async function findMarriedCounterparts(caller: string): Promise<MarriedCounterpart[]> {
    if (!caller) {
        return [];
    }
    const { where } = marriedPairs(caller);

    return prisma.$queryRaw<MarriedCounterpart[]>`
        SELECT p.chain,
               p.pet_id AS "petId",
               p.name   AS "petName",
               p.dna    AS "petDna",
               s.pet_id AS "spousePetId",
               s.name   AS "spouseName",
               s.dna    AS "spouseDna",
               s.owner  AS counterpart
        ${where}
        ORDER BY p.pet_id ASC
    `;
}

/**
 * Whether these two wallets currently have a married pet pair.
 *
 * The binary form of `findMarriedCounterparts`, for the authorization check that runs on
 * every message read and send: that path only needs a yes or no, and fetching every
 * counterpart to filter one out in JavaScript reads more rows the busier a player is.
 */
export async function isMarriedTo(caller: string, counterpart: string): Promise<boolean> {
    if (!caller || !counterpart) {
        return false;
    }
    const { chain, where } = marriedPairs(caller);

    const rows = await prisma.$queryRaw<{ ok: number }[]>`
        SELECT 1 AS ok
        ${where}
          AND ${ownerKey(chain, 's')} = ${normalizeAccount(counterpart)}
        LIMIT 1
    `;
    return rows.length > 0;
}

/**
 * The thread id for a pair, creating it if this is their first.
 *
 * Participants are stored in lexicographic order, which is what makes the unique
 * constraint mean "one thread per pair" instead of "one per direction" — without it A→B
 * and B→A would be two threads holding half a conversation each.
 *
 * An upsert rather than find-then-create: it is one round trip whether or not the thread
 * exists, and two callers opening the same thread at once resolve to the same row instead
 * of racing to a unique-constraint violation.
 */
export async function openThread(
    walletX: string,
    walletY: string,
    scope: string
): Promise<string> {
    const [participantA, participantB] = walletX < walletY ? [walletX, walletY] : [walletY, walletX];

    const thread = await prisma.chatThread.upsert({
        where: { chat_thread_pair: { participantA, participantB } },
        create: { participantA, participantB, scope },
        update: {},
        select: { id: true },
    });
    return thread.id;
}

/** The thread by id, or null. Returns participants so the caller can authorize. */
export function findThreadById(id: string) {
    return prisma.chatThread.findUnique({
        where: { id },
        select: { id: true, participantA: true, participantB: true },
    });
}

export interface ChatMessageRow {
    id: number;
    sender: string;
    text: string;
    createdAt: Date;
}

/**
 * A page of messages, oldest first within the page.
 *
 * Paged backwards from `before` (an exclusive message id) because a chat is read from its
 * end: the first page is the newest messages, and older ones load as the reader scrolls
 * up.
 */
export async function findMessages(
    threadId: string,
    limit: number,
    before?: number
): Promise<ChatMessageRow[]> {
    const rows = await prisma.chatMessage.findMany({
        where: { threadId, ...(before != null ? { id: { lt: before } } : {}) },
        orderBy: { id: 'desc' },
        take: limit,
        select: { id: true, sender: true, text: true, createdAt: true },
    });
    return rows.reverse();
}

/** Appends a message. */
export function insertMessage(
    threadId: string,
    sender: string,
    text: string
): Promise<ChatMessageRow> {
    return prisma.chatMessage.create({
        data: { threadId, sender, text },
        select: { id: true, sender: true, text: true, createdAt: true },
    });
}

/**
 * Records that `participant` has read up to `messageId`.
 *
 * `GREATEST` rather than a plain assignment: the watermark only ever moves forward. A
 * client that scrolls up and re-marks, or whose two tabs report different positions,
 * would otherwise walk it backwards and un-read messages the sender has already been
 * shown as read.
 */
export async function markThreadRead(
    threadId: string,
    participant: string,
    messageId: number
): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO chat_read (thread_id, participant, last_read_id, updated_at)
        VALUES (${threadId}, ${normalizeAccount(participant)}, ${messageId}, now())
        ON CONFLICT (thread_id, participant) DO UPDATE
        SET last_read_id = GREATEST(chat_read.last_read_id, EXCLUDED.last_read_id),
            updated_at = now()
    `;
}

/**
 * The newest message id anyone other than `caller` has read in this thread.
 *
 * 0 when nobody has, which reads naturally at the call site: every message id is
 * positive, so nothing is marked seen. Excluding the caller by address rather than
 * looking their counterpart up keeps this to one query and stays correct if a thread
 * ever holds more than two participants.
 */
export async function findCounterpartReadId(threadId: string, caller: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ lastReadId: number | null }[]>`
        SELECT MAX(last_read_id) AS "lastReadId"
        FROM chat_read
        WHERE thread_id = ${threadId}
          AND participant <> ${normalizeAccount(caller)}
    `;
    return rows[0]?.lastReadId ?? 0;
}

/** One emoji on one message, with who reacted. */
export interface ChatReactionRow {
    messageId: number;
    participant: string;
    emoji: string;
}

/**
 * Applies a reaction tap: sets it, replaces the previous one, or removes it.
 *
 * Returns the reaction now in place, or null if the tap removed one. Toggling is decided
 * here rather than in the service because the decision needs the current row, and a read
 * then a write would let two taps interleave into the wrong final state.
 *
 * One statement, because Postgres runs every data-modifying CTE and the insert's
 * `NOT EXISTS (SELECT 1 FROM removed)` makes it conditional on the delete having matched:
 * tapping the emoji already stored deletes it and inserts nothing, anything else replaces.
 */
export async function setReaction(
    messageId: number,
    participant: string,
    emoji: string
): Promise<string | null> {
    const who = normalizeAccount(participant);
    const rows = await prisma.$queryRaw<{ emoji: string }[]>`
        WITH removed AS (
            DELETE FROM chat_reaction
            WHERE message_id = ${messageId} AND participant = ${who} AND emoji = ${emoji}
            RETURNING emoji
        ), applied AS (
            INSERT INTO chat_reaction (message_id, participant, emoji, created_at)
            SELECT ${messageId}, ${who}, ${emoji}, now()
            WHERE NOT EXISTS (SELECT 1 FROM removed)
            ON CONFLICT (message_id, participant) DO UPDATE
            SET emoji = EXCLUDED.emoji, created_at = now()
            RETURNING emoji
        )
        SELECT emoji FROM applied
    `;
    return rows[0]?.emoji ?? null;
}

/** Removes a participant's reaction to a message, if any. */
export async function clearReaction(messageId: number, participant: string): Promise<void> {
    await prisma.chatReaction.deleteMany({
        where: { messageId, participant: normalizeAccount(participant) },
    });
}

/** The participant's current reaction to a message, or null. */
export async function findReaction(
    messageId: number,
    participant: string
): Promise<string | null> {
    const row = await prisma.chatReaction.findUnique({
        where: {
            messageId_participant: { messageId, participant: normalizeAccount(participant) },
        },
        select: { emoji: true },
    });
    return row?.emoji ?? null;
}

/**
 * Every reaction on a page of messages, in one query.
 *
 * Per-message queries would be one round trip per row rendered; a page is fifty. Returns
 * the raw rows and lets the service group them, because who reacted matters to the caller
 * (their own reaction is the one the UI highlights) and a count alone would lose it.
 */
export async function findReactionsForMessages(
    messageIds: number[]
): Promise<ChatReactionRow[]> {
    if (messageIds.length === 0) return [];
    return prisma.chatReaction.findMany({
        where: { messageId: { in: messageIds } },
        select: { messageId: true, participant: true, emoji: true },
        orderBy: [{ messageId: 'asc' }, { createdAt: 'asc' }],
    });
}

/**
 * Whether a message belongs to a thread.
 *
 * Reaction requests name both, and authorization is thread-level. Without this check a
 * caller could authorize against a thread they are in and then name any message id in the
 * database, reacting to a conversation they cannot read — and reactions are visible to the
 * people in that thread, so it would be writing into it.
 */
export async function messageBelongsToThread(
    messageId: number,
    threadId: string
): Promise<boolean> {
    const row = await prisma.chatMessage.findFirst({
        where: { id: messageId, threadId },
        select: { id: true },
    });
    return row !== null;
}
