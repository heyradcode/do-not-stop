import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useChatMessages,
    useChatThreads,
    type ChatThread,
    type Pet,
    type PetChain,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import PetArt from '@components/pet/pet-art';
import SessionGate from '@components/common/session-gate';
import Icon, { MarriageIcon } from '@components/ui/icon';
import { CHAT_WS_URL } from '../../config';
import { sameAccount, shortAddress } from '@utils/address';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import styles from './index.module.css';

/** The married pets behind a thread, as a one-line reason it exists. */
function marriageLine(thread: ChatThread): string {
    return thread.pets.map((pair) => `${pair.petName} ♥ ${pair.spouseName}`).join(', ');
}

/**
 * The pet standing in for each side of a thread.
 *
 * A thread belongs to two owners, but what the game connected is their pets, and a
 * truncated wallet address identifies nobody. Where a pair has several married couples
 * the first is used: the rows are ordered by pet id, so the choice is stable between
 * loads rather than shuffling with the query plan.
 */
function facesOf(thread: ChatThread): { mine: Pet | null; theirs: Pet | null } {
    const pair = thread.pets[0];
    if (!pair) return { mine: null, theirs: null };
    const chain = thread.chain as PetChain;
    // `dna` is newer than the rest of the payload, and the client deploys separately from
    // the backend that serves it. No dna means no art and no emoji, so the row falls back
    // to a plain bubble rather than throwing on `BigInt(undefined)` and taking the page
    // down over an avatar.
    const face = (id: string, name: string, dna?: string) =>
        dna ? (({ id, name, chain, dna: BigInt(dna) }) as Pet) : null;
    return {
        mine: face(pair.petId, pair.petName, pair.petDna),
        theirs: face(pair.spousePetId, pair.spouseName, pair.spouseDna),
    };
}

function timeOf(createdAt: string): string {
    const at = new Date(createdAt);
    return Number.isNaN(at.getTime())
        ? ''
        : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ThreadList: React.FC<{
    threads: ChatThread[];
    selectedId: string | null;
    onSelect: (threadId: string) => void;
}> = ({ threads, selectedId, onSelect }) => (
    <ul className={styles.threadList}>
        {threads.map((thread) => (
            <li key={thread.threadId}>
                <button
                    type="button"
                    className={
                        thread.threadId === selectedId
                            ? `${styles.threadButton} ${styles.isActive}`
                            : styles.threadButton
                    }
                    onClick={() => onSelect(thread.threadId)}
                    aria-current={thread.threadId === selectedId ? 'true' : undefined}
                >
                    <span className={styles.threadName}>{shortAddress(thread.counterpart)}</span>
                    <span className={styles.threadSub}>{marriageLine(thread)}</span>
                </button>
            </li>
        ))}
    </ul>
);

const Conversation: React.FC<{ thread: ChatThread; me: string }> = ({ thread, me }) => {
    const { messages, isLoading, error, isLive, online, send, isSending, sendError } =
        useChatMessages({
            threadId: thread.threadId,
            socketUrl: CHAT_WS_URL,
        });

    // Only a live channel can say anyone is present. While it is down every dot would
    // otherwise read grey, which is indistinguishable from "they left" — so the header
    // says the channel is offline instead of asserting anything about the other person.
    const counterpartOnline =
        isLive && online.some((address) => sameAccount(address, thread.counterpart));
    const faces = useMemo(() => facesOf(thread), [thread]);
    const [draft, setDraft] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLTextAreaElement>(null);

    // Grows with the draft up to the max height the stylesheet sets, then scrolls.
    // Reset to `auto` first: scrollHeight never shrinks below the height already set, so
    // measuring without clearing it makes the box one-way.
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        box.style.height = 'auto';
        box.style.height = `${box.scrollHeight}px`;
    }, [draft]);

    // Chats are read from the bottom. Keyed on the newest id rather than length so a
    // re-read that changes nothing does not yank the view while someone scrolls up.
    const newestId = messages[messages.length - 1]?.id;
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [newestId]);

    /**
     * Enter sends; Shift+Enter and Ctrl+Enter break the line.
     *
     * The messenger convention, and the reason the box is a textarea at all — a form's
     * lone text input submits on Enter for free, but it can only ever hold one line.
     *
     * `isComposing` guards the Enter that closes an IME candidate window: for anyone
     * typing Japanese, Korean or Chinese that keystroke picks a character and would
     * otherwise fire the message off mid-word.
     */
    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey) return;
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        void submit(event);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text || isSending) return;
        try {
            // Cleared only after the server accepts it: a send refused because the
            // marriage ended must leave the text where the player can see it.
            await send(text);
            setDraft('');
        } catch {
            // Already surfaced through `sendError`. Caught rather than left to reject,
            // which in an onSubmit handler becomes an unhandled rejection nobody sees.
        }
    };

    return (
        <div className={styles.conversation}>
            <header className={styles.conversationHeader}>
                <span className={styles.conversationTitle}>
                    <span
                        className={
                            counterpartOnline ? `${styles.dot} ${styles.isOnline}` : styles.dot
                        }
                        // The dot is the whole signal, so it carries the text rather than
                        // relying on colour, which a screen reader cannot see and a
                        // colour-blind player may not distinguish.
                        role="img"
                        aria-label={counterpartOnline ? 'Online' : 'Offline'}
                        title={counterpartOnline ? 'Online now' : 'Offline'}
                    />
                    {shortAddress(thread.counterpart)}
                </span>
                <span className={styles.conversationSub}>{marriageLine(thread)}</span>
                {!isLive && (
                    <span className={styles.offline} title="Reconnecting; messages still send">
                        reconnecting
                    </span>
                )}
            </header>

            {error ? (
                <p className={`${styles.placeholder} ${styles.error}`}>{error.message}</p>
            ) : isLoading ? (
                <div className="loading-container">
                    <div className="loading-spinner" />
                </div>
            ) : messages.length === 0 ? (
                <p className={`${styles.placeholder} ${styles.empty}`}>
                    No messages yet. Say hello.
                </p>
            ) : (
                <ol className={styles.messages}>
                    {messages.map((message, index) => {
                        const isMine = sameAccount(message.sender, me);
                        const next = messages[index + 1];
                        // One face per run of consecutive messages, on the last of the
                        // run. Repeating it on every line in a two-person thread is the
                        // noise messengers avoid; dropping it entirely loses the thing
                        // worth showing, which is whose pet is talking.
                        const endsRun = !next || sameAccount(next.sender, me) !== isMine;
                        const face = isMine ? faces.mine : faces.theirs;
                        return (
                            <li
                                key={message.id}
                                className={
                                    isMine ? `${styles.message} ${styles.isMine}` : styles.message
                                }
                            >
                                {endsRun && face ? (
                                    <span className={styles.messageFace} title={face.name}>
                                        <PetArt pet={face} />
                                    </span>
                                ) : (
                                    // Holds the column so bubbles in a run stay aligned
                                    // with the one that carries the face.
                                    <span className={styles.messageFaceGap} aria-hidden />
                                )}
                                <div className={styles.bubble}>
                                    <span className={styles.messageText}>{message.text}</span>
                                    <span className={styles.messageTime}>
                                        {timeOf(message.createdAt)}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                    <div ref={endRef} />
                </ol>
            )}

            <form className={styles.composer} onSubmit={submit}>
                <textarea
                    ref={boxRef}
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Write a message"
                    maxLength={2000}
                    aria-label="Message"
                />
                <button type="submit" disabled={!draft.trim() || isSending}>
                    {isSending ? 'Sending…' : 'Send'}
                </button>
            </form>
            {sendError && <p className={styles.error}>{sendError.message}</p>}
        </div>
    );
};

/**
 * Private chat between owners whose pets are married (roadmap §2 v1).
 *
 * The thread list is whatever the backend says it is. There is no way to start a
 * conversation from here, by design: v1 has no discovery surface at all, so the only
 * people a player can message are ones the game already connected them to. That is what
 * lets v1 ship without block/report — a protection that ends the moment open DMs land.
 *
 * An empty list is the normal state for most players and says so, rather than looking
 * like a failed load.
 */
const Chat: React.FC = () => {
    const navigate = useNavigate();
    const { walletAddress } = useChainCapabilities();
    const { threads, isLoading, error } = useChatThreads();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selected = useMemo(
        () => threads.find((thread) => thread.threadId === selectedId) ?? threads[0] ?? null,
        [threads, selectedId],
    );

    const goBack = () => navigate(DASHBOARD_HOME);
    const heading = (
        <>
            <Icon as={MarriageIcon} tone={Tones.Magenta} />
            Messages
        </>
    );

    return (
        <SessionGate
            title={heading}
            connectPrompt="Connect your wallet to see your conversations"
            signInPrompt="Sign in to open your conversations"
            tone="magenta"
            back={goBack}
        >
            <DashboardPanel
                className={styles.page}
                title={heading}
                description="Private threads with the owners your pets are married to"
                back={goBack}
            >
                {error ? (
                    <p className={styles.error}>{error.message}</p>
                ) : isLoading ? (
                    <div className="loading-container">
                        <div className="loading-spinner" />
                    </div>
                ) : threads.length === 0 ? (
                    <p className={styles.empty}>
                        No conversations yet. Marry one of your pets to another player&apos;s to open
                        a thread with them.
                    </p>
                ) : (
                    <div className={styles.layout}>
                        <ThreadList
                            threads={threads}
                            selectedId={selected?.threadId ?? null}
                            onSelect={setSelectedId}
                        />
                        {selected && (
                            <Conversation
                                // Remounts on thread change, so the draft and scroll position
                                // belong to the conversation on screen rather than following
                                // the reader into the next one.
                                key={selected.threadId}
                                thread={selected}
                                me={walletAddress ?? ''}
                            />
                        )}
                    </div>
                )}
            </DashboardPanel>
        </SessionGate>
    );
};

export default Chat;
