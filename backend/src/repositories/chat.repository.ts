import { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import type { Chain } from '@typings/chain';

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
    /** The caller's married pet. */
    petId: string;
    petName: string;
    /** The spouse pet, and the wallet that owns it. */
    spousePetId: string;
    spouseName: string;
    counterpart: string;
}

/**
 * Every wallet the caller is currently married to, one row per married pet pair.
 *
 * Two normalization details, both of which decide whether a real marriage is found:
 *
 *  - `owner` in `pet_roster` is written by indexer-go, which is not guaranteed to
 *    match the JWT's case. The caller arrives normalized (EVM lowercased, base58
 *    untouched), so EVM rows are matched folded and Solana rows exactly. Folding
 *    base58 could match a different pubkey, which here would open someone else's
 *    marriage.
 *  - The chain comes from the address shape rather than a parameter. A wallet only
 *    exists on one chain, so asking the caller which chain they meant would let them
 *    ask the wrong one.
 *
 * A pet marries a pet, so an owner pair can appear more than once (two of their pets
 * married to each other's). The caller collapses that into one thread per pair.
 */
export async function findMarriedCounterparts(caller: string): Promise<MarriedCounterpart[]> {
    if (!caller) {
        return [];
    }

    const isEvm = /^0x[0-9a-f]{40}$/.test(caller);
    const ownerMatch = isEvm
        ? Prisma.sql`LOWER(p.owner) = ${caller}`
        : Prisma.sql`p.owner = ${caller}`;
    const chain: Chain = isEvm ? 'evm' : 'solana';

    return prisma.$queryRaw<MarriedCounterpart[]>`
        SELECT p.chain,
               p.pet_id AS "petId",
               p.name   AS "petName",
               s.pet_id AS "spousePetId",
               s.name   AS "spouseName",
               s.owner  AS counterpart
        FROM pet_roster p
        JOIN pet_roster s
          ON s.chain = p.chain
         AND s.pet_id = p.spouse_id
        WHERE p.chain = ${chain}
          AND ${ownerMatch}
          AND p.spouse_id <> '0'
          -- A pet married to another pet of the caller's own is a marriage, but not a
          -- conversation: there is no second person to talk to.
          AND s.owner <> p.owner
        ORDER BY p.pet_id ASC
    `;
}

/** A thread plus the counterpart, as one participant sees it. */
export interface ThreadRow {
    id: string;
    counterpart: string;
    createdAt: Date;
}

/**
 * The thread for a pair, creating it if this is their first.
 *
 * Participants are stored in lexicographic order, which is what makes the unique
 * constraint mean "one thread per pair" instead of "one per direction" — without it
 * A→B and B→A would be two threads holding half a conversation each.
 *
 * Concurrent first-opens race, so a unique-constraint violation is resolved by reading
 * the winner's row rather than failing: both callers are entitled to the same thread.
 */
export async function openThread(
    walletX: string,
    walletY: string,
    scope: string
): Promise<ThreadRow> {
    const [participantA, participantB] = walletX < walletY ? [walletX, walletY] : [walletY, walletX];
    const where = { chat_thread_pair: { participantA, participantB } };

    const existing = await prisma.chatThread.findUnique({ where });
    if (existing) {
        return toThreadRow(existing, walletX);
    }

    try {
        const created = await prisma.chatThread.create({
            data: { participantA, participantB, scope },
        });
        return toThreadRow(created, walletX);
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const winner = await prisma.chatThread.findUniqueOrThrow({ where });
            return toThreadRow(winner, walletX);
        }
        throw err;
    }
}

/** The thread by id, or null. Returns participants so the caller can authorize. */
export function findThreadById(id: string) {
    return prisma.chatThread.findUnique({
        where: { id },
        select: { id: true, participantA: true, participantB: true, scope: true },
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
 * Paged backwards from `before` (an exclusive message id) because a chat is read from
 * its end: the first page is the newest messages, and older ones load as the reader
 * scrolls up.
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

function toThreadRow(
    thread: { id: string; participantA: string; participantB: string; createdAt: Date },
    viewer: string
): ThreadRow {
    return {
        id: thread.id,
        counterpart: thread.participantA === viewer ? thread.participantB : thread.participantA,
        createdAt: thread.createdAt,
    };
}
