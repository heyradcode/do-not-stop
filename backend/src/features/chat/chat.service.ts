import { normalizeAccount } from '@cryptopets/protocol';

import {
    findMarriedCounterparts,
    findMessages,
    findThreadById,
    insertMessage,
    isMarriedTo,
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
export async function listThreads(rawCaller: string): Promise<ChatThreadView[]> {
    // Normalized once, here, because the caller is also the thread's participant key: an
    // unnormalized spelling of the same wallet would open a second thread beside the
    // first and split the conversation. Production callers arrive normalized from the
    // JWT; this makes that an invariant of the feature rather than of its callers.
    const caller = normalizeAccount(rawCaller);
    const marriages = await findMarriedCounterparts(caller);
    if (marriages.length === 0) {
        return [];
    }

    // Group first, then open every thread at once. Opening inside the loop made this one
    // sequential round trip per counterpart on a screen that loads them all together.
    const byCounterpart = new Map<string, Omit<ChatThreadView, 'threadId'>>();
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
        } else {
            byCounterpart.set(counterpart, { counterpart, pets: [pets], chain: marriage.chain });
        }
    }

    const views = [...byCounterpart.values()];
    const threadIds = await Promise.all(
        views.map((view) => openThread(caller, view.counterpart, MARRIAGE_SCOPE))
    );
    return views.map((view, index) => ({ ...view, threadId: threadIds[index] as string }));
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
export async function authorizeThread(threadId: string, rawCaller: string): Promise<ChatDenial | null> {
    const caller = normalizeAccount(rawCaller);
    const thread = await findThreadById(threadId);
    if (!thread) {
        return 'not-found';
    }

    const isParticipant = thread.participantA === caller || thread.participantB === caller;
    if (!isParticipant) {
        return 'not-a-participant';
    }

    const counterpart = thread.participantA === caller ? thread.participantB : thread.participantA;
    return (await isMarriedTo(caller, counterpart)) ? null : 'not-married';
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
