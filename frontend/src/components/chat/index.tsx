import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
    CHAT_REACTIONS,
    useChainCapabilities,
    useChatMessages,
    useChatThreads,
    type ChatMessage,
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

/**
 * How many of the set the picker offers before it is expanded.
 *
 * The first six, which is what everyone reaches for; the rest are one press away. A wall
 * of forty as the first thing you see is a decision where a reaction should be a reflex.
 */
const QUICK_REACTIONS = 6;

/** Room the collapsed row and the full grid each need above the trigger to open upward. */
const QUICK_HEIGHT = 52;
const PICKER_MAX_HEIGHT = 224;

/**
 * The chips under a message: one per emoji used, with how many used it.
 *
 * Tapping a chip you are already in removes your reaction, which is the same gesture as
 * adding it and is what both messengers do.
 */
const ReactionChips: React.FC<{
    message: ChatMessage;
    onReact: (messageId: number, emoji: string) => void;
}> = ({ message, onReact }) => {
    const reactions = message.reactions ?? [];
    if (reactions.length === 0) return null;

    return (
        <div className={styles.reactions}>
            {reactions.map((reaction) => (
                <button
                    key={reaction.emoji}
                    type="button"
                    className={clsx(
                        styles.reactionChip,
                        reaction.mine && styles.isMineReaction,
                        reaction.count > 1 && styles.hasCount,
                    )}
                    onClick={() => onReact(message.id, reaction.emoji)}
                    aria-pressed={reaction.mine}
                    aria-label={`${reaction.emoji} ${reaction.count}`}
                >
                    <span aria-hidden>{reaction.emoji}</span>
                    {/* The count is worth showing only once it stops being obvious. */}
                    {reaction.count > 1 && (
                        <span className={styles.reactionCount}>{reaction.count}</span>
                    )}
                </button>
            ))}
        </div>
    );
};

/**
 * The control that adds a reaction, beside the bubble on the side away from the pet.
 *
 * The picker is a fixed six — the list the server accepts — so there is no search, no
 * skin-tone menu and nothing to load. It opens inward, over the message rather than the
 * margin, because the transcript scrolls vertically and clips anything that runs past its
 * edge sideways.
 */
const ReactionAdd: React.FC<{
    message: ChatMessage;
    onReact: (messageId: number, emoji: string) => void;
}> = ({ message, onReact }) => {
    const [picking, setPicking] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [below, setBelow] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const close = useCallback(() => {
        setPicking(false);
        // Reset, so reopening starts at the quick row rather than wherever it was left.
        setExpanded(false);
    }, []);

    /** Distance from the trigger to the top of the transcript, which is what clips it. */
    const roomAbove = () => {
        const trigger = triggerRef.current?.getBoundingClientRect();
        const list = triggerRef.current?.closest('ol')?.getBoundingClientRect();
        return trigger && list ? trigger.top - list.top : Number.POSITIVE_INFINITY;
    };

    /**
     * Opens upward, or downward when there is not room above.
     *
     * Measured per state rather than fixed: the transcript clips the picker, and the
     * collapsed row needs a fraction of the height the full grid does — deciding once
     * with either number gets the other case wrong.
     */
    const toggle = () => {
        if (picking) {
            close();
            return;
        }
        setBelow(roomAbove() < QUICK_HEIGHT);
        setPicking(true);
    };

    const expand = () => {
        setBelow(roomAbove() < PICKER_MAX_HEIGHT);
        setExpanded(true);
    };

    // A click anywhere else closes it, which is what every menu does and what a reader
    // expects when they have changed their mind. Escape too: the picker takes focus, so
    // leaving the keyboard without a way out would trap it.
    useEffect(() => {
        if (!picking) return;

        const onPointerDown = (event: MouseEvent) => {
            if (rootRef.current?.contains(event.target as Node)) return;
            close();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [picking, close]);

    const offered = expanded ? CHAT_REACTIONS : CHAT_REACTIONS.slice(0, QUICK_REACTIONS);

    return (
        <div className={styles.reactionTrigger} ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                className={styles.reactionAdd}
                onClick={toggle}
                aria-expanded={picking}
                aria-label="Add a reaction"
                title="Add a reaction"
            >
                <span aria-hidden>☺</span>
            </button>

            {picking && (
                <div
                    className={clsx(
                        styles.reactionPicker,
                        below && styles.isBelow,
                        expanded && styles.isExpanded,
                    )}
                    role="group"
                    aria-label="Reactions"
                >
                    {offered.map((emoji) => (
                        <button
                            key={emoji}
                            type="button"
                            className={styles.reactionOption}
                            onClick={() => {
                                onReact(message.id, emoji);
                                close();
                            }}
                            aria-label={emoji}
                        >
                            {emoji}
                        </button>
                    ))}

                    {!expanded && (
                        <button
                            type="button"
                            className={styles.reactionMore}
                            onClick={expand}
                            aria-label="More reactions"
                            title="More reactions"
                        >
                            <span className={styles.reactionMoreChevron} aria-hidden />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

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
    const {
        messages,
        readUpTo,
        markRead,
        react,
        isLoading,
        error,
        isLive,
        online,
        send,
        isSending,
        sendError,
    } = useChatMessages({
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
    //
    // Reset to `auto` first: scrollHeight never shrinks below the height already set, so
    // measuring without clearing it makes the box one-way. The border is added back
    // because scrollHeight covers content and padding but not the border, and the box is
    // border-box — without it the field is short by its own border and scrolls a line
    // that fits.
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        box.style.height = 'auto';
        const border = box.offsetHeight - box.clientHeight;
        box.style.height = `${box.scrollHeight + border}px`;
    }, [draft]);

    // Chats are read from the bottom. Keyed on the newest id rather than length so a
    // re-read that changes nothing does not yank the view while someone scrolls up.
    const newest = messages[messages.length - 1];
    const newestId = newest?.id;
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [newestId]);

    // Open thread means read. Marking on arrival rather than on visibility is the v1
    // rule: this panel shows one conversation at a time and scrolls to the end, so a
    // message that lands here is on screen. Own messages are skipped — the watermark
    // exists to answer what the *other* side has seen.
    useEffect(() => {
        if (newest && !sameAccount(newest.sender, me)) markRead(newest.id);
    }, [newest, me, markRead]);

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
                                {/* The pet rides beside the bubble; reactions hang under
                                    the pair. Nesting the bubble and its reactions together
                                    instead put the pet level with the reaction chips,
                                    since the row bottom-aligns whatever it holds. */}
                                <div className={styles.row}>
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
                                    {/* Time and receipt travel together in the bubble's
                                        bottom-right corner. Own messages carry the
                                        receipt: yours is the only side whose reading is
                                        news to anyone. */}
                                    <span className={styles.messageMeta}>
                                        <span className={styles.messageTime}>
                                            {timeOf(message.createdAt)}
                                        </span>
                                        {isMine && (
                                            <span
                                                className={
                                                    message.id <= readUpTo
                                                        ? `${styles.receipt} ${styles.isSeen}`
                                                        : styles.receipt
                                                }
                                                role="img"
                                                aria-label={
                                                    message.id <= readUpTo ? 'Seen' : 'Sent'
                                                }
                                                title={message.id <= readUpTo ? 'Seen' : 'Sent'}
                                            >
                                                {message.id <= readUpTo ? '✓✓' : '✓'}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <ReactionAdd message={message} onReact={react} />
                                </div>
                                <ReactionChips message={message} onReact={react} />
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
            <Icon as={MarriageIcon} tone={Tones.Violet} />
            Messages
        </>
    );

    return (
        <SessionGate
            title={heading}
            connectPrompt="Connect your wallet to see your conversations"
            signInPrompt="Sign in to open your conversations"
            tone="violet"
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
