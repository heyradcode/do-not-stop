/**
 * The one piece of chat state worth a controller: which thread is open, and what happens when
 * it stops existing underneath the reader.
 *
 * Access is derived per request rather than stored, so a divorce closes a conversation with
 * no revocation step. That makes "the thread vanished while you were reading it" a normal
 * path, not an edge case, and it was previously unreachable from any test.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { ChatThread } from '@shared/core';

const mockState = {
    threads: [] as ChatThread[],
};

jest.mock('@shared/core', () => ({
    useChatThreads: () => ({ threads: mockState.threads, isLoading: false, error: null }),
    useChatMessages: () => ({ messages: [], online: [], markRead: jest.fn() }),
    sameAccount: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}));

jest.mock('wagmi', () => ({ useAccount: () => ({ address: '0xME' }) }));

import { useChatPanel, type UseChatPanel } from '../src/hooks/chat/useChatPanel';

const thread = (id: string): ChatThread =>
    ({ threadId: id, counterpart: '0xthem', pets: [] }) as unknown as ChatThread;

let panel!: UseChatPanel;

const Probe = () => {
    panel = useChatPanel();
    return null;
};

const mount = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(<Probe />);
    });
    return tree;
};

const rerender = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(async () => tree.update(<Probe />));
};

beforeEach(() => {
    mockState.threads = [thread('a'), thread('b')];
});

describe('useChatPanel', () => {
    it('opens nothing until a thread is chosen', async () => {
        await mount();
        expect(panel.openThread).toBeNull();
    });

    it('opens the thread it was given', async () => {
        const tree = await mount();
        await ReactTestRenderer.act(async () => panel.onOpen('b'));
        expect(panel.openThread?.threadId).toBe('b');
        await rerender(tree);
    });

    it('falls back to the list when the open thread disappears', async () => {
        // A divorce landing mid-conversation. Keeping it open would show a transcript whose
        // next read is going to fail, so the honest response is to go back.
        const tree = await mount();
        await ReactTestRenderer.act(async () => panel.onOpen('b'));
        expect(panel.openThread?.threadId).toBe('b');

        mockState.threads = [thread('a')];
        await rerender(tree);

        expect(panel.openThread).toBeNull();
    });

    it('does not re-open a thread that came back', async () => {
        // What the effect is actually for. `openThread` is derived, so a vanished thread
        // already reads as null without it; what it clears is the remembered id. Leave that
        // set and a thread reappearing in a later read yanks the player back into a
        // conversation they had been dropped out of.
        const tree = await mount();
        await ReactTestRenderer.act(async () => panel.onOpen('b'));

        mockState.threads = [thread('a')];
        await rerender(tree);
        expect(panel.openThread).toBeNull();

        mockState.threads = [thread('a'), thread('b')];
        await rerender(tree);
        expect(panel.openThread).toBeNull();
    });

    it('keeps the thread open while it is still there', async () => {
        // The other half: a list that merely re-reads must not bounce the reader out.
        const tree = await mount();
        await ReactTestRenderer.act(async () => panel.onOpen('b'));

        mockState.threads = [thread('a'), thread('b')];
        await rerender(tree);

        expect(panel.openThread?.threadId).toBe('b');
    });

    it('carries the caller’s own address, for deciding which side a message sits on', async () => {
        await mount();
        expect(panel.selfAddress).toBe('0xME');
    });
});
