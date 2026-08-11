import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    CHAT_REACTIONS,
    sameAccount,
    shortAddress,
    useChatMessages,
    useChatThreads,
    type ChatMessage,
    type ChatThread,
} from '@shared/core';
import { useAccount } from 'wagmi';

import { CHAT_WS_URL } from '../constants/api';
import { neon, neonGlow } from '../theme/neon';

/** How many reactions the picker offers. The full set is far more than a sheet can hold. */
const QUICK_REACTIONS = CHAT_REACTIONS.slice(0, 6);

/**
 * Private chat between married players (roadmap section 2).
 *
 * Two views in one screen: the thread list, and one conversation. A phone has no room
 * for frontend's side-by-side layout, and a thread is not a route of its own because
 * access is not a property of the URL — it is rechecked per request.
 *
 * **Access is never cached and never inferred here.** The backend derives it from live
 * `pet_roster.spouse_id` on every read, send and socket upgrade, so a divorce closes the
 * conversation with no revocation step to forget. A thread vanishing from the list is
 * this working.
 *
 * **A non-participant gets 404, not 403**, identical to a thread that does not exist,
 * because 403 would confirm a thread id to anyone probing. So a failed read renders as
 * "conversation unavailable" without distinguishing the two, and this screen must not
 * try to explain which happened.
 *
 * The socket carries no message text. It says the thread changed and the hook re-reads,
 * which is why losing it degrades to "not live" rather than to wrong.
 */
export default function ChatScreen() {
    const { address } = useAccount();
    const { threads, isLoading, error } = useChatThreads();
    const [openThreadId, setOpenThreadId] = useState<string | null>(null);

    // A thread that disappears while open is a divorce landing mid-conversation. Falling
    // back to the list is the honest response; keeping it open would show a transcript
    // whose next read is going to fail.
    useEffect(() => {
        if (openThreadId && !threads.some((t) => t.threadId === openThreadId)) {
            setOpenThreadId(null);
        }
    }, [threads, openThreadId]);

    const open = threads.find((t) => t.threadId === openThreadId) ?? null;

    if (open) {
        return (
            <Conversation
                thread={open}
                selfAddress={address ?? ''}
                onBack={() => setOpenThreadId(null)}
            />
        );
    }

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Text style={styles.title}>Messages</Text>
                <Text style={styles.subtitle}>
                    One conversation per player you are married to
                </Text>
            </View>

            {error ? (
                <Text style={styles.error}>{error.message}</Text>
            ) : isLoading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={neon.cyan} />
                </View>
            ) : threads.length === 0 ? (
                <Text style={styles.empty}>
                    No conversations yet. Marrying one of your pets to another player&apos;s
                    opens one.
                </Text>
            ) : (
                <FlatList
                    data={threads}
                    keyExtractor={(t) => t.threadId}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.threadRow}
                            onPress={() => setOpenThreadId(item.threadId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open chat with ${shortAddress(item.counterpart)}`}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.threadName}>
                                {shortAddress(item.counterpart)}
                            </Text>
                            <Text style={styles.threadPets} numberOfLines={2}>
                                {item.pets
                                    .map((p) => `${p.petName} ♥ ${p.spouseName}`)
                                    .join('   ·   ')}
                            </Text>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

/** One thread's transcript, its composer, and who is currently in it. */
const Conversation: React.FC<{
    thread: ChatThread;
    selfAddress: string;
    onBack: () => void;
}> = ({ thread, selfAddress, onBack }) => {
    const chat = useChatMessages({ threadId: thread.threadId, socketUrl: CHAT_WS_URL });
    const [draft, setDraft] = useState('');
    const [reactingTo, setReactingTo] = useState<number | null>(null);

    const newest = chat.messages[chat.messages.length - 1];

    // Moves this side's watermark whenever the last message changes. Fire and forget in
    // the hook, so a failed receipt is a tick that stays single until the next read.
    useEffect(() => {
        if (newest) chat.markRead(newest.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newest?.id]);

    /**
     * Presence counts identities, not sockets: one person with a phone and a browser is
     * one person. `sameAccount` normalizes by address shape, so this needs no chain
     * branch.
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

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={onBack}
                    accessibilityRole="button"
                    accessibilityLabel="Back to conversations"
                    hitSlop={8}
                >
                    <Text style={styles.back}>‹ Conversations</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{shortAddress(thread.counterpart)}</Text>
                    <View style={styles.presence}>
                        <View
                            style={[
                                styles.presenceDot,
                                { backgroundColor: counterpartOnline ? neon.success : neon.textDim },
                            ]}
                        />
                        <Text style={styles.presenceText}>
                            {counterpartOnline ? 'online' : 'offline'}
                            {chat.isLive ? '' : ' · not live'}
                        </Text>
                    </View>
                </View>
            </View>

            {chat.error ? (
                // Deliberately one message for both "no such thread" and "not yours":
                // telling them apart is what a 403 would have leaked.
                <Text style={styles.error}>
                    This conversation is unavailable. If the marriage ended, it is closed.
                </Text>
            ) : chat.isLoading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={neon.cyan} />
                </View>
            ) : (
                <FlatList
                    data={[...chat.messages].reverse()}
                    inverted
                    keyExtractor={(m) => String(m.id)}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    onEndReached={() => chat.hasOlder && chat.loadOlder()}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        chat.isLoadingOlder ? (
                            <ActivityIndicator color={neon.cyan} style={styles.olderSpinner} />
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <Bubble
                            message={item}
                            mine={sameAccount(item.sender, selfAddress)}
                            readUpTo={chat.readUpTo}
                            picking={reactingTo === item.id}
                            onPick={() => setReactingTo(reactingTo === item.id ? null : item.id)}
                            onReact={(emoji) => {
                                chat.react(item.id, emoji);
                                setReactingTo(null);
                            }}
                        />
                    )}
                />
            )}

            {chat.sendError ? (
                <Text style={styles.error}>Could not send: {chat.sendError.message}</Text>
            ) : null}

            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Message"
                    placeholderTextColor={neon.textDim}
                    multiline
                    accessibilityLabel="Message"
                />
                <TouchableOpacity
                    style={[styles.send, (!draft.trim() || chat.isSending) && styles.disabled]}
                    onPress={() => {
                        onSend();
                    }}
                    disabled={!draft.trim() || chat.isSending}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    activeOpacity={0.85}
                >
                    <Text style={styles.sendText}>{chat.isSending ? '…' : 'Send'}</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const Bubble: React.FC<{
    message: ChatMessage;
    mine: boolean;
    readUpTo: number;
    picking: boolean;
    onPick: () => void;
    onReact: (emoji: string) => void;
}> = ({ message, mine, readUpTo, picking, onPick, onReact }) => (
    <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
        <Pressable
            onLongPress={onPick}
            style={[styles.bubble, mine ? styles.mine : styles.theirs]}
            accessibilityRole="button"
            accessibilityLabel={`Message: ${message.text}`}
        >
            <Text style={styles.bubbleText}>{message.text}</Text>
        </Pressable>

        {message.reactions?.length ? (
            <View style={styles.reactions}>
                {message.reactions.map((r) => (
                    <TouchableOpacity
                        key={r.emoji}
                        style={[styles.reaction, r.mine && styles.reactionMine]}
                        onPress={() => onReact(r.emoji)}
                        accessibilityRole="button"
                        accessibilityLabel={`React ${r.emoji}`}
                    >
                        <Text style={styles.reactionText}>
                            {r.emoji} {r.count}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        ) : null}

        {picking ? (
            <View style={styles.picker}>
                {QUICK_REACTIONS.map((emoji) => (
                    <TouchableOpacity
                        key={emoji}
                        onPress={() => onReact(emoji)}
                        accessibilityRole="button"
                        accessibilityLabel={`React ${emoji}`}
                        hitSlop={6}
                    >
                        <Text style={styles.pickerEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        ) : null}

        {/* One watermark for the whole thread, so `id <= readUpTo` answers it per message. */}
        {mine && message.id <= readUpTo ? <Text style={styles.readTick}>Read</Text> : null}
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: neon.bgDeep },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: neon.border,
        backgroundColor: neon.bgPanel,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { color: neon.purple, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
    },
    subtitle: { fontSize: 13, color: neon.textMuted, marginTop: 4 },
    presence: { flexDirection: 'row', alignItems: 'center' },
    presenceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    presenceText: { fontSize: 12, color: neon.textMuted },
    listContent: { padding: 16 },
    threadRow: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 14,
        marginBottom: 10,
    },
    threadName: { fontSize: 16, fontWeight: '800', color: neon.text },
    threadPets: { fontSize: 12, color: neon.textMuted, marginTop: 4, lineHeight: 17 },
    bubbleWrap: { marginBottom: 10, maxWidth: '82%' },
    mineWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    theirsWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubble: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1 },
    mine: { backgroundColor: neon.bgCard, borderColor: neon.cyan },
    theirs: { backgroundColor: neon.bgPanel, borderColor: neon.borderMagenta },
    bubbleText: { fontSize: 15, color: neon.text, lineHeight: 20 },
    reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
    reaction: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgPanel,
        paddingHorizontal: 7,
        paddingVertical: 3,
        marginRight: 5,
    },
    reactionMine: { borderColor: neon.cyan },
    reactionText: { fontSize: 12, color: neon.textMuted },
    picker: {
        flexDirection: 'row',
        marginTop: 6,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    pickerEmoji: { fontSize: 20, marginHorizontal: 5 },
    readTick: { fontSize: 10, color: neon.textDim, marginTop: 2 },
    olderSpinner: { marginVertical: 12 },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: neon.border,
        backgroundColor: neon.bgPanel,
    },
    input: {
        flex: 1,
        maxHeight: 120,
        backgroundColor: neon.bgInput,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: neon.text,
    },
    send: {
        marginLeft: 10,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.35),
    },
    sendText: { color: neon.cyan, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.45 },
    loading: { paddingVertical: 40, alignItems: 'center' },
    empty: { padding: 16, fontSize: 14, color: neon.textMuted, lineHeight: 20 },
    error: { padding: 16, fontSize: 13, color: neon.danger, lineHeight: 19 },
});
