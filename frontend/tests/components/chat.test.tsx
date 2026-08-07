import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useChainCapabilities = vi.fn();
const useChatThreads = vi.fn();
const useChatMessages = vi.fn();

const useAuth = vi.fn();

vi.mock('@shared/core', () => ({
    useAuth: () => useAuth(),
    // `@utils/address` normalizes through the protocol helper; the real one, since the
    // EVM-folds/base58-doesn't rule is what several of these assertions are about.
    normalizeAccount: (value: string) => (/^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value),
    useChainCapabilities: () => useChainCapabilities(),
    useChatThreads: () => useChatThreads(),
    useChatMessages: (opts: unknown) => useChatMessages(opts),
    getPetAvatar: () => '🐉',
    // No art service in these tests: PetArt renders the emoji alone.
    petArtUrl: () => null,
}));

// `config.ts` registers the storage adapter with @shared/core at module scope, which the
// mock above does not provide. Only the socket URL is needed here, so stub the module
// rather than reconstructing the app's bootstrap.
vi.mock('../../src/config', () => ({
    API_URL: 'http://test',
    BATTLE_ROOM_WS_URL: 'ws://test/ws/battle-room',
    CHAT_WS_URL: 'ws://test/ws/chat',
}));

import Chat from '@components/chat';

const ME = '0xAAAAbbbbCCCCddddEEEEffff0000111122223333';
const THEM = '0x2222222222222222222222222222222222222222';

const thread = (over: Record<string, unknown> = {}) => ({
    threadId: 't1',
    counterpart: THEM,
    pets: [
        {
            petId: '1',
            petName: 'Mine',
            petDna: '1',
            spousePetId: '2',
            spouseName: 'Theirs',
            spouseDna: '2',
        },
    ],
    chain: 'evm',
    ...over,
});

const message = (over: Record<string, unknown> = {}) => ({
    id: 1,
    sender: THEM,
    text: 'hello there',
    createdAt: new Date(0).toISOString(),
    ...over,
});

const send = vi.fn();

const messagesResult = (over: Record<string, unknown> = {}) => ({
    messages: [],
    isLoading: false,
    error: null,
    isLive: true,
    online: [],
    send,
    isSending: false,
    sendError: null,
    ...over,
});

const renderChat = () =>
    render(
        <MemoryRouter initialEntries={['/messages']}>
            <Chat />
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, signAndLogin: vi.fn() });
    send.mockResolvedValue(undefined);
    useChainCapabilities.mockReturnValue({ isConnected: true, walletAddress: ME });
    useChatThreads.mockReturnValue({ threads: [], isLoading: false, error: null });
    useChatMessages.mockReturnValue(messagesResult());
});

describe('Chat', () => {
    it('asks for a wallet before showing conversations', () => {
        useChainCapabilities.mockReturnValue({ isConnected: false, walletAddress: null });

        renderChat();

        expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
    });

    // The normal state for most players, and it must not read as a failed load.
    // A connected wallet is not a session: the API is JWT-gated, so rendering the panel
    // here produced 401s surfaced as a raw error, or an empty state claiming there were
    // no conversations when the truth was that nobody had signed in.
    it('offers sign-in when the wallet is connected but the session is not', () => {
        useAuth.mockReturnValue({ isAuthenticated: false, signAndLogin: vi.fn() });

        renderChat();

        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        expect(screen.queryByText(/Marry one of your pets/i)).toBeNull();
    });

    it('starts the sign-in flow when the button is pressed', async () => {
        const signAndLogin = vi.fn();
        useAuth.mockReturnValue({ isAuthenticated: false, signAndLogin });

        renderChat();
        await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

        expect(signAndLogin).toHaveBeenCalled();
    });

    it('explains how to get a thread when there are none', () => {
        renderChat();

        expect(screen.getByText(/Marry one of your pets/i)).toBeInTheDocument();
    });

    it('shows the counterpart and the marriage behind each thread', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });

        renderChat();

        expect(screen.getAllByText(/0x2222…2222/).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Mine ♥ Theirs').length).toBeGreaterThan(0);
    });

    it('shows one pet face per run of messages, not one per message', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        useChatMessages.mockReturnValue(
            messagesResult({
                messages: [
                    message(),
                    message({ id: 2, text: 'still me' }),
                    message({ id: 3, sender: ME.toLowerCase(), text: 'hi back' }),
                ],
            }),
        );

        renderChat();

        const theirs = screen.getByText('hello there').closest('li') as HTMLElement;
        const theirsLast = screen.getByText('still me').closest('li') as HTMLElement;
        const mine = screen.getByText('hi back').closest('li') as HTMLElement;

        // Case differs between the wallet and the stored sender, so the sides must not
        // be decided by an exact string match.
        expect(mine.className).not.toEqual(theirs.className);

        // The face lands on the last message of a run; the earlier ones hold the column
        // with a spacer so the bubbles stay aligned.
        expect(theirs.querySelector('.messageFace')).toBeNull();
        expect(theirs.querySelector('.messageFaceGap')).not.toBeNull();
        expect(theirsLast.querySelector('.messageFace')).not.toBeNull();
        expect(mine.querySelector('.messageFace')).not.toBeNull();
        // Each side shows its own pet.
        expect(theirsLast.querySelector('.messageFace')).toHaveAttribute('title', 'Theirs');
        expect(mine.querySelector('.messageFace')).toHaveAttribute('title', 'Mine');
    });

    it('sends the trimmed draft and clears the box', async () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });

        renderChat();
        const box = screen.getByLabelText('Message');
        await userEvent.type(box, '  hello  ');
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(send).toHaveBeenCalledWith('hello');
        expect(box).toHaveValue('');
    });

    // A refused send must leave the text where the player can see it, not swallow it.
    it('keeps the draft when sending fails', async () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        send.mockRejectedValue(new Error('marriage ended'));

        renderChat();
        const box = screen.getByLabelText('Message');
        await userEvent.type(box, 'still here');
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(box).toHaveValue('still here');
    });

    it('will not send an empty draft', async () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });

        renderChat();
        await userEvent.type(screen.getByLabelText('Message'), '   ');

        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
        expect(send).not.toHaveBeenCalled();
    });

    it('shows the counterpart as online when they are connected', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        // Deliberately a different case from the stored address: presence is matched on
        // accounts, not strings.
        useChatMessages.mockReturnValue(
            messagesResult({ online: [THEM.toUpperCase().replace('0X', '0x')] }),
        );

        renderChat();

        expect(screen.getByLabelText('Online')).toBeInTheDocument();
    });

    it('shows the counterpart as offline when only you are connected', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        useChatMessages.mockReturnValue(messagesResult({ online: [ME] }));

        renderChat();

        expect(screen.getByLabelText('Offline')).toBeInTheDocument();
    });

    // A dropped channel cannot report presence. Showing grey would be indistinguishable
    // from "they left", so the dot must not claim anything while the socket is down.
    it('does not claim the counterpart is online while the channel is down', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        useChatMessages.mockReturnValue(messagesResult({ isLive: false, online: [ME, THEM] }));

        renderChat();

        expect(screen.getByLabelText('Offline')).toBeInTheDocument();
    });

    it('says when the live channel is down without blocking sending', () => {
        useChatThreads.mockReturnValue({ threads: [thread()], isLoading: false, error: null });
        useChatMessages.mockReturnValue(messagesResult({ isLive: false }));

        renderChat();

        expect(screen.getByText('reconnecting')).toBeInTheDocument();
        expect(screen.getByLabelText('Message')).toBeEnabled();
    });

    it('switches conversations when another thread is picked', async () => {
        useChatThreads.mockReturnValue({
            threads: [thread(), thread({ threadId: 't2', counterpart: '0x3333333333333333333333333333333333333333' })],
            isLoading: false,
            error: null,
        });

        renderChat();
        const list = screen.getByRole('list');
        await userEvent.click(within(list).getByText(/0x3333…3333/));

        expect(useChatMessages).toHaveBeenLastCalledWith(
            expect.objectContaining({ threadId: 't2' }),
        );
    });

    it('surfaces a thread-list failure', () => {
        useChatThreads.mockReturnValue({
            threads: [],
            isLoading: false,
            error: new Error('backend unreachable'),
        });

        renderChat();

        expect(screen.getByText('backend unreachable')).toBeInTheDocument();
    });
});
