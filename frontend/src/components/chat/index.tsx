import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useChatMessages,
    useChatThreads,
    type ChatThread,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import StateCard from '@components/pet/interactions/state-card';
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
    const { messages, isLoading, error, isLive, send, isSending, sendError } = useChatMessages({
        threadId: thread.threadId,
        socketUrl: CHAT_WS_URL,
    });
    const [draft, setDraft] = useState('');
    const endRef = useRef<HTMLDivElement>(null);

    // Chats are read from the bottom. Keyed on the newest id rather than length so a
    // re-read that changes nothing does not yank the view while someone scrolls up.
    const newestId = messages[messages.length - 1]?.id;
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [newestId]);

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
                <span className={styles.conversationTitle}>{shortAddress(thread.counterpart)}</span>
                <span className={styles.conversationSub}>{marriageLine(thread)}</span>
                {!isLive && (
                    <span className={styles.offline} title="Reconnecting; messages still send">
                        offline
                    </span>
                )}
            </header>

            {error ? (
                <p className={styles.error}>{error.message}</p>
            ) : isLoading ? (
                <div className="loading-container">
                    <div className="loading-spinner" />
                </div>
            ) : messages.length === 0 ? (
                <p className={styles.empty}>No messages yet. Say hello.</p>
            ) : (
                <ol className={styles.messages}>
                    {messages.map((message) => (
                        <li
                            key={message.id}
                            className={
                                sameAccount(message.sender, me)
                                    ? `${styles.message} ${styles.isMine}`
                                    : styles.message
                            }
                        >
                            <span className={styles.messageText}>{message.text}</span>
                            <span className={styles.messageTime}>{timeOf(message.createdAt)}</span>
                        </li>
                    ))}
                    <div ref={endRef} />
                </ol>
            )}

            <form className={styles.composer} onSubmit={submit}>
                <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
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
    const { isConnected, walletAddress } = useChainCapabilities();
    const { threads, isLoading, error } = useChatThreads();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selected = useMemo(
        () => threads.find((thread) => thread.threadId === selectedId) ?? threads[0] ?? null,
        [threads, selectedId],
    );

    const goBack = () => navigate(DASHBOARD_HOME);

    if (!isConnected) {
        return (
            <StateCard
                containerClassName="wallet-disconnected"
                title={
                    <>
                        <Icon as={MarriageIcon} tone={Tones.Magenta} />
                        Messages
                    </>
                }
                description="Connect your wallet to see your conversations"
                back={goBack}
            />
        );
    }

    return (
        <DashboardPanel
            title={
                <>
                    <Icon as={MarriageIcon} tone={Tones.Magenta} />
                    Messages
                </>
            }
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
    );
};

export default Chat;
