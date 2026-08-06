import { normalizeAccount } from '@cryptopets/protocol';

import {
    findMarriedCounterparts,
    findMessages,
    findThreadById,
    insertMessage,
    openThread,
    type ChatMessageRow,
} from '@repositories/chat.repository';

/**
 * Private player-to-player chat, v1 (roadmap §2).
 *
 * Access is the whole feature. A thread is readable and writable only while the two
 * wallets have a married pet pair, checked against `pet_roster.spouse_id` on **every**
 * request rather than recorded on the thread. That is the difference between "these two
 * are married" and "these two were married once": a divorce closes the thread the moment
 * the indexer sees it, with no revocation step to forget.
 *
 * The scope is deliberately the narrowest thing that is still a chat feature. There is
 * no discovery surface, no way to name a counterpart, and no way to start a thread with
 * anyone the game has not already connected you to — so the v2 question (open DMs)
 * arrives with moderation as a prerequisite rather than as a retrofit.
 *
 * What v1 does NOT have, all of it flagged in the roadmap as a product call rather than
 * an oversight: no block/report, no profanity filtering, no read receipts, no presence,
 * no edit or delete, and no retention policy. Messages are kept until someone decides
 * what the policy is. Rate limiting and a length cap are the only abuse controls, and
 * they are volume controls, not content ones.
 */

const MARRIAGE_SCOPE = 'marriage';

/** A thread as the caller sees it, with the marriage that justifies it. */
export interface ChatThreadView {
    threadId: string;
    counterpart: string;
    /** The married pair behind this thread, for a UI that wants to say why it exists. */
    pets: { petId: string; petName: string; spousePetId: string; spouseName: string }[];
    chain: string;
}

/**
 * Every thread the caller may currently use, derived from live marriage state.
 *
 * Threads are created here rather than by an explicit "open chat" call: a married pair
 * always ends up with exactly one thread, so making the client ask for it first would
 * add a round trip and a null state that only ever resolves one way. The insert is
 * idempotent.
 *
 * A pair with two married pet couples collapses to one thread carrying both pairs,
 * because the conversation is between the owners, not the pets.
 */
export async function listThreads(caller: string): Promise<ChatThreadView[]> {
    const marriages = await findMarriedCounterparts(caller);
    if (marriages.length === 0) {
        return [];
    }

    const byCounterpart = new Map<string, ChatThreadView>();
    for (const marriage of marriages) {
        const counterpart = normalizeAccount(marriage.counterpart);
        const pets = {
            petId: marriage.petId,
            petName: marriage.petName,
            spousePetId: marriage.spousePetId,
            spouseName: marriage.spouseName,
        };

        const seen = byCounterpart.get(counterpart);
        if (seen) {
            seen.pets.push(pets);
            continue;
        }

        const thread = await openThread(caller, counterpart, MARRIAGE_SCOPE);
        byCounterpart.set(counterpart, {
            threadId: thread.id,
            counterpart,
            pets: [pets],
            chain: marriage.chain,
        });
    }

    return [...byCounterpart.values()];
}

/** Why a thread request was refused. `null` means it was not. */
export type ChatDenial = 'not-found' | 'not-a-participant' | 'not-married';

/**
 * Authorizes one request against one thread.
 *
 * Both checks are needed and neither implies the other. Participation says the thread is
 * yours; the marriage says it is still live. A thread whose marriage has ended stays in
 * the database — deleting it would destroy the history — but stops answering, which is
 * why this returns a reason a caller can distinguish rather than a bare boolean.
 */
export async function authorizeThread(
    threadId: string,
    caller: string
): Promise<{ denial: ChatDenial } | { denial: null; counterpart: string }> {
    const thread = await findThreadById(threadId);
    if (!thread) {
        return { denial: 'not-found' };
    }

    const isParticipant = thread.participantA === caller || thread.participantB === caller;
    if (!isParticipant) {
        return { denial: 'not-a-participant' };
    }

    const counterpart = thread.participantA === caller ? thread.participantB : thread.participantA;
    const marriages = await findMarriedCounterparts(caller);
    const stillMarried = marriages.some(
        (marriage) => normalizeAccount(marriage.counterpart) === counterpart
    );

    return stillMarried ? { denial: null, counterpart } : { denial: 'not-married' };
}

/** A page of messages. Authorization is the caller's job — see `authorizeThread`. */
export function readMessages(
    threadId: string,
    limit: number,
    before?: number
): Promise<ChatMessageRow[]> {
    return findMessages(threadId, limit, before);
}

/** Appends the caller's message. Authorization is the caller's job. */
export function sendMessage(
    threadId: string,
    sender: string,
    text: string
): Promise<ChatMessageRow> {
    return insertMessage(threadId, sender, text);
}
