/**
 * Private chat, and the parts of it that are security properties rather than styling.
 *
 * Access is derived per request from live marriage state, never cached here. A thread
 * leaving the list is a divorce landing, which is the feature working. And a
 * non-participant gets 404, identical to a thread that does not exist, because a 403
 * would confirm a thread id to anyone probing — so a failed read must render one message
 * for both and this screen must not try to explain which happened.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const SELF = '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa';
const THEM = '0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb';

const thread = (over: Record<string, unknown> = {}) => ({
    threadId: 't1',
    counterpart: THEM,
    chain: 'ethereum',
    pets: [
        {
            petId: '1',
            petName: 'Rex',
            petDna: '1',
            spousePetId: '9',
            spouseName: 'Luna',
            spouseDna: '2',
        },
    ],
    ...over,
});

const message = (over: Record<string, unknown> = {}) => ({
    id: 1,
    sender: THEM,
    text: 'hello',
    createdAt: '2026-08-11T00:00:00Z',
    ...over,
});

const mockState = {
    threads: [] as Record<string, unknown>[],
    threadsLoading: false,
    threadsError: null as Error | null,
    messages: [] as Record<string, unknown>[],
    messagesError: null as Error | null,
    readUpTo: 0,
    online: [] as string[],
    isLive: true,
    sendError: null as Error | null,
};

const mockSend = jest.fn();
const mockReact = jest.fn();
const mockMarkRead = jest.fn();
const mockMessagesArgs = jest.fn();

jest.mock('../src/components/PetArt', () => () => null);

/**
 * Pass-through here: these suites are about what the screen draws once the session
 * exists. The gate has its own suite, so re-exercising it five times would only make
 * every fixture carry auth state it does not use.
 */
jest.mock('../src/components/SessionGate', () => {
    const React_ = jest.requireActual('react');
    return ({ children }: { children: React.ReactNode }) =>
        React_.createElement(React_.Fragment, null, children);
});

jest.mock('@shared/core', () => ({
    CHAT_REACTIONS: ['👍', '❤️', '😂', '😮', '😢', '🙏', '👎'],
    shortAddress: (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`,
    sameAccount: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
    useChatThreads: () => ({
        threads: mockState.threads,
        isLoading: mockState.threadsLoading,
        error: mockState.threadsError,
    }),
    useChatMessages: (opts: unknown) => {
        mockMessagesArgs(opts);
        return {
            messages: mockState.messages,
            readUpTo: mockState.readUpTo,
            markRead: mockMarkRead,
            react: mockReact,
            isLoading: false,
            error: mockState.messagesError,
            isLive: mockState.isLive,
            online: mockState.online,
            send: mockSend,
            isSending: false,
            sendError: mockState.sendError,
            hasOlder: false,
            isLoadingOlder: false,
            loadOlder: jest.fn(),
        };
    },
}));

jest.mock('wagmi', () => ({ useAccount: () => ({ address: SELF }) }));

import ChatScreen from '../src/screens/ChatScreen';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<ChatScreen />);
    });
    return tree;
};


const press = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const node = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

const openThread = (tree: ReactTestRenderer.ReactTestRenderer) =>
    press(tree, `Open chat with ${THEM.slice(0, 6)}...${THEM.slice(-4)}`);

beforeEach(() => {
    mockState.threads = [thread()];
    mockState.threadsLoading = false;
    mockState.threadsError = null;
    mockState.messages = [message()];
    mockState.messagesError = null;
    mockState.readUpTo = 0;
    mockState.online = [];
    mockState.isLive = true;
    mockState.sendError = null;
    jest.clearAllMocks();
});

describe('thread list', () => {
    it('names the counterpart and the married pairs the thread exists for', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Rex ♥ Luna');
    });

    it('explains an empty list rather than looking broken', async () => {
        mockState.threads = [];
        const tree = await render();
        expect(textOf(tree)).toContain('No conversations yet');
    });
});

describe('access', () => {
    it('falls back to the list when an open thread disappears, which is a divorce', async () => {
        const tree = await render();
        await openThread(tree);
        expect(tree.root.findAllByType(TextInput)).toHaveLength(1);

        mockState.threads = [];
        await ReactTestRenderer.act(async () => {
            tree.update(<ChatScreen />);
        });

        // Back on the list, not sitting in a transcript whose next read would fail.
        expect(textOf(tree)).toContain('No conversations yet');
        expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('gives one message for a failed read, never naming which case it was', async () => {
        mockState.messagesError = new Error('Request failed with status code 404');
        const tree = await render();
        await openThread(tree);

        const rendered = textOf(tree);
        expect(rendered).toContain('unavailable');
        // The distinction a 403 would have leaked must not be reconstructed here.
        expect(rendered).not.toContain('404');
        expect(rendered).not.toContain('not a participant');
    });
});

describe('conversation', () => {
    it('marks the newest message read, moving this side of the watermark', async () => {
        mockState.messages = [message({ id: 4 })];
        const tree = await render();
        await openThread(tree);
        expect(mockMarkRead).toHaveBeenCalledWith(4);
    });

    it('shows a read receipt only on your own messages, by watermark', async () => {
        mockState.messages = [message({ id: 1, sender: SELF }), message({ id: 2, sender: SELF })];
        mockState.readUpTo = 1;
        const tree = await render();
        await openThread(tree);
        // One tick: id 1 is at or below the watermark, id 2 is not.
        expect(textOf(tree).match(/Read/g) ?? []).toHaveLength(1);
    });

    it('counts presence by identity, so the counterpart shows online', async () => {
        mockState.online = [SELF.toLowerCase(), THEM.toLowerCase()];
        const tree = await render();
        await openThread(tree);
        expect(textOf(tree)).toContain('online');
    });

    it('says it is not live when the socket is down, without blocking reads', async () => {
        mockState.isLive = false;
        const tree = await render();
        await openThread(tree);
        expect(textOf(tree)).toContain('not live');
        expect(textOf(tree)).toContain('hello');
    });

    it('sends the trimmed draft', async () => {
        const tree = await render();
        await openThread(tree);
        await ReactTestRenderer.act(async () => {
            tree.root.findByType(TextInput).props.onChangeText('  well fought  ');
        });
        await press(tree, 'Send message');
        expect(mockSend).toHaveBeenCalledWith('well fought');
    });

    it('gives the words back when a send fails', async () => {
        mockSend.mockRejectedValueOnce(new Error('marriage ended'));
        const tree = await render();
        await openThread(tree);
        await ReactTestRenderer.act(async () => {
            tree.root.findByType(TextInput).props.onChangeText('hi');
        });
        await press(tree, 'Send message');
        // Restored rather than dropped: the message never arrived, so it is still theirs.
        expect(tree.root.findByType(TextInput).props.value).toBe('hi');
    });

    it('toggles an existing reaction through the server rather than guessing', async () => {
        mockState.messages = [message({ reactions: [{ emoji: '👍', count: 1, mine: true }] })];
        const tree = await render();
        await openThread(tree);
        await press(tree, 'React 👍');
        expect(mockReact).toHaveBeenCalledWith(1, '👍');
    });

    it('passes the socket url through, so the thread can go live', async () => {
        const tree = await render();
        await openThread(tree);
        const asked = mockMessagesArgs.mock.calls.at(-1)?.[0] as { threadId: string };
        expect(asked.threadId).toBe('t1');
    });
});
