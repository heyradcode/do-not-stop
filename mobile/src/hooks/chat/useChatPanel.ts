import { useEffect, useMemo, useState } from 'react';
import { sameAccount, useChatMessages, useChatThreads, type ChatThread } from '@shared/core';
import { useAccount } from 'wagmi';

import { CHAT_WS_URL } from '../../constants/api';

export interface UseChatPanel {
    threads: ChatThread[];
    isLoading: boolean;
    error: Error | null;
    /** The thread being read, or null on the list. */
    openThread: ChatThread | null;
    onOpen: (threadId: string) => void;
    onBack: () => void;
    /** The caller's own address, for deciding which side a message sits on. */
    selfAddress: string;
}

/**
 * The thread list, and which of them is open.
 *
 * Access is rechecked per request rather than stored, so a thread can vanish underneath a
 * reader: a divorce closes the conversation the moment the indexer sees it. That is the one
 * piece of state here worth a controller rather than a `useState` in the view.
 */
export const useChatPanel = (): UseChatPanel => {
    const { address } = useAccount();
    const { threads, isLoading, error } = useChatThreads();
    const [openThreadId, setOpenThreadId] = useState<string | null>(null);

    // A thread that disappears while open is a divorce landing mid-conversation. Falling back
    // to the list is the honest response; keeping it open would show a transcript whose next
    // read is going to fail.
    useEffect(() => {
        if (openThreadId && !threads.some((t) => t.threadId === openThreadId)) {
            setOpenThreadId(null);
        }
    }, [threads, openThreadId]);

    return {
        threads,
        isLoading,
        error,
        openThread: threads.find((t) => t.threadId === openThreadId) ?? null,
        onOpen: setOpenThreadId,
        onBack: () => setOpenThreadId(null),
        selfAddress: address ?? '',
    };
};

/**
 * Everything `useChatMessages` returns, plus the state a conversation view adds on top.
 *
 * An intersection rather than a hand-listed shape. The message hook lives in `shared` and
 * owns a dozen fields (paging, send status, read watermarks); restating them here would be a
 * second copy to keep in step, and the first draft of this hook did exactly that and missed
 * five of them.
 */
export type UseConversation = ReturnType<typeof useChatMessages> & {
    draft: string;
    onDraftChange: (draft: string) => void;
    onSend: () => Promise<void>;
    /** The message id whose reaction picker is open, or null. */
    reactingTo: number | null;
    onReactTo: (id: number | null) => void;
    counterpartOnline: boolean;
};

/**
 * One open conversation: its messages, the draft, and who is online.
 *
 * Separate from `useChatPanel` because it is a different machine with a different lifetime.
 * It mounts when a thread opens and unmounts when it closes, which is what gives the socket
 * and the read watermark the right scope.
 */
export const useConversation = (thread: ChatThread): UseConversation => {
    const chat = useChatMessages({ threadId: thread.threadId, socketUrl: CHAT_WS_URL });
    const [draft, setDraft] = useState('');
    const [reactingTo, setReactingTo] = useState<number | null>(null);

    const newest = chat.messages[chat.messages.length - 1];

    // Moves this side's watermark whenever the last message changes. Fire and forget in the
    // hook, so a failed receipt is a tick that stays single until the next read.
    useEffect(() => {
        if (newest) chat.markRead(newest.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newest?.id]);

    /**
     * Presence counts identities, not sockets: one person with a phone and a browser is one
     * person. `sameAccount` normalizes by address shape, so this needs no chain branch.
     */
    const counterpartOnline = useMemo(
        () => chat.online.some((who) => sameAccount(who, thread.counterpart)),
        [chat.online, thread.counterpart],
    );

    const onSend = async () => {
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        try {
            await chat.send(text);
        } catch {
            // Restored rather than dropped: the send failed, so the words are still the
            // player's to edit or retry. `sendError` renders the reason below.
            setDraft(text);
        }
    };

    return {
        ...chat,
        draft,
        onDraftChange: setDraft,
        onSend,
        reactingTo,
        onReactTo: setReactingTo,
        counterpartOnline,
    };
};
