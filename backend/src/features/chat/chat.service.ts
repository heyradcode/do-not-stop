import { normalizeAccount } from '@cryptopets/protocol';

import {
    findMarriedCounterparts,
    findCounterpartReadId,
    findMessages,
    findReactionsForMessages,
    findThreadById,
    insertMessage,
    isMarriedTo,
    markThreadRead,
    messageBelongsToThread,
    openThread,
    setReaction,
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
    pets: {
        petId: string;
        petName: string;
        petDna: string;
        spousePetId: string;
        spouseName: string;
        spouseDna: string;
    }[];
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
            petDna: marriage.petDna,
            spousePetId: marriage.spousePetId,
            spouseName: marriage.spouseName,
            spouseDna: marriage.spouseDna,
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

/** One emoji on one message, as the reader needs it. */
export interface ChatReactionView {
    emoji: string;
    /** How many people reacted with it. */
    count: number;
    /** Whether the reader is one of them, which is the one the UI lights up. */
    mine: boolean;
}

/** A message with its reactions attached. */
export type ChatMessageView = ChatMessageRow & { reactions: ChatReactionView[] };

/** A page of messages, and how far the other participant has read. */
export interface ChatPage {
    messages: ChatMessageView[];
    /**
     * Newest message id the counterpart has read; 0 if none. The caller's own messages up
     * to here have been seen. Sent with every page rather than per message: it is one
     * number for the whole thread, and a client compares it against the ids it already
     * has.
     */
    readUpTo: number;
}

/** A page of messages. Authorization is the caller's job — see `authorizeThread`. */
export async function readMessages(
    threadId: string,
    caller: string,
    limit: number,
    before?: number
): Promise<ChatPage> {
    const [rows, readUpTo] = await Promise.all([
        findMessages(threadId, limit, before),
        findCounterpartReadId(threadId, caller),
    ]);
    // One query for the whole page's reactions, not one per message.
    const reactions = await findReactionsForMessages(rows.map((row) => row.id));
    return { messages: attachReactions(rows, reactions, caller), readUpTo };
}

/**
 * Groups raw reaction rows onto their messages.
 *
 * Emoji keep the order they were first used on each message, so a reaction bar does not
 * reshuffle under the reader when someone else joins one that is already there.
 */
function attachReactions(
    rows: ChatMessageRow[],
    reactions: { messageId: number; participant: string; emoji: string }[],
    caller: string
): ChatMessageView[] {
    const me = normalizeAccount(caller);
    const byMessage = new Map<number, Map<string, ChatReactionView>>();
    for (const reaction of reactions) {
        let group = byMessage.get(reaction.messageId);
        if (!group) {
            group = new Map();
            byMessage.set(reaction.messageId, group);
        }
        const entry = group.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
        entry.count += 1;
        entry.mine ||= reaction.participant === me;
        group.set(reaction.emoji, entry);
    }
    return rows.map((row) => ({ ...row, reactions: [...(byMessage.get(row.id)?.values() ?? [])] }));
}

/**
 * Applies a reaction tap and reports what the caller now holds, or null if it was removed.
 *
 * Authorization is the caller's job, and it is thread-level: a participant may react to
 * either side's messages, which is the whole point. The message is checked to belong to
 * the thread so a thread id the caller *can* read cannot be used to reach a message in one
 * they cannot.
 */
export async function reactToMessage(
    threadId: string,
    caller: string,
    messageId: number,
    emoji: string
): Promise<{ emoji: string | null } | 'not-found'> {
    const belongs = await messageBelongsToThread(messageId, threadId);
    if (!belongs) return 'not-found';
    return { emoji: await setReaction(messageId, caller, emoji) };
}

/**
 * Records that the caller has read up to `messageId`. Authorization is the caller's job.
 *
 * Marking a message the caller sent themselves is harmless and not worth a round trip to
 * prevent: the watermark is only ever read to answer "has the *other* side seen this",
 * and their own messages are excluded from that question by construction.
 */
export function markRead(threadId: string, caller: string, messageId: number): Promise<void> {
    return markThreadRead(threadId, caller, messageId);
}

/** Appends the caller's message. Authorization is the caller's job. */
export function sendMessage(
    threadId: string,
    sender: string,
    text: string
): Promise<ChatMessageRow> {
    return insertMessage(threadId, sender, text);
}
