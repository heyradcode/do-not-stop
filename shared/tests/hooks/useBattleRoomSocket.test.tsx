// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBattleRoomSocket } from '../../src/hooks/battle/useBattleRoomSocket';

/**
 * A controllable WebSocket stand-in. Real sockets cannot be driven deterministically, and
 * the behaviour under test here is precisely the timing: what fires on open, on message, and
 * on a reconnect after an unexpected close.
 */
class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
    }

    close(): void {
        this.closed = true;
    }

    /** Drives the handlers the hook installed. */
    open(): void {
        this.onopen?.();
    }
    emit(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }
    emitRaw(data: string): void {
        this.onmessage?.({ data });
    }
    drop(): void {
        this.onclose?.();
    }
}

const NOTIFICATION = { type: 'battle-updated', battleId: 'btl_0001', state: 'signed' };

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('subscription lifetime', () => {
    it('connects to the room it was given', () => {
        renderHook(() => useBattleRoomSocket({ url: 'ws://x/ws/battle-room', roomId: 'room_1' }));

        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(FakeWebSocket.instances[0]!.url).toBe('ws://x/ws/battle-room?roomId=room_1');
    });

    it('encodes a room id that would otherwise break the query string', () => {
        renderHook(() => useBattleRoomSocket({ url: 'ws://x/ws/battle-room', roomId: 'a&b=c' }));
        expect(FakeWebSocket.instances[0]!.url).toBe('ws://x/ws/battle-room?roomId=a%26b%3Dc');
    });

    it('does not connect without a url or a room', () => {
        renderHook(() => useBattleRoomSocket({ url: undefined, roomId: 'room_1' }));
        renderHook(() => useBattleRoomSocket({ url: 'ws://x/ws/battle-room', roomId: null }));
        expect(FakeWebSocket.instances).toHaveLength(0);
    });

    it('reports connection state', () => {
        const { result } = renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1' }));
        expect(result.current.connected).toBe(false);

        act(() => FakeWebSocket.instances[0]!.open());
        expect(result.current.connected).toBe(true);

        act(() => FakeWebSocket.instances[0]!.drop());
        expect(result.current.connected).toBe(false);
    });

    it('closes the socket on unmount and does not reconnect afterwards', () => {
        const { unmount } = renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1' }));
        act(() => FakeWebSocket.instances[0]!.open());

        unmount();

        expect(FakeWebSocket.instances[0]!.closed).toBe(true);
        act(() => void vi.advanceTimersByTime(60_000));
        // A close caused by teardown must not schedule a retry for a subscription that is
        // going away, or every navigation would leak a socket.
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});

describe('notifications', () => {
    it('forwards a well-formed notification', () => {
        const onNotification = vi.fn();
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1', onNotification }));

        act(() => FakeWebSocket.instances[0]!.emit(NOTIFICATION));

        expect(onNotification).toHaveBeenCalledWith(NOTIFICATION);
    });

    it('ignores malformed frames rather than throwing', () => {
        const onNotification = vi.fn();
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1', onNotification }));

        act(() => FakeWebSocket.instances[0]!.emitRaw('not json'));
        act(() => FakeWebSocket.instances[0]!.emit({ type: 'something-else' }));

        expect(onNotification).not.toHaveBeenCalled();
    });

    it('does not rebuild the socket when the callback identity changes', () => {
        // A caller passing an inline closure would otherwise tear down and reconnect on
        // every render, which is both wasteful and a source of missed messages.
        const { rerender } = renderHook(
            ({ cb }: { cb: () => void }) => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1', onNotification: cb }),
            { initialProps: { cb: () => undefined } },
        );

        rerender({ cb: () => undefined });
        rerender({ cb: () => undefined });

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('routes messages to the latest callback, not the one captured at connect time', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = renderHook(
            ({ cb }: { cb: () => void }) => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1', onNotification: cb }),
            { initialProps: { cb: first } },
        );

        rerender({ cb: second });
        act(() => FakeWebSocket.instances[0]!.emit(NOTIFICATION));

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith(NOTIFICATION);
    });
});

describe('reconnection', () => {
    it('reconnects after an unexpected close', () => {
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1' }));
        act(() => FakeWebSocket.instances[0]!.open());

        act(() => FakeWebSocket.instances[0]!.drop());
        act(() => void vi.advanceTimersByTime(1000));

        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('fires onReconnect only on a later connect, never the first', () => {
        const onReconnect = vi.fn();
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1', onReconnect }));

        act(() => FakeWebSocket.instances[0]!.open());
        expect(onReconnect).not.toHaveBeenCalled();

        act(() => FakeWebSocket.instances[0]!.drop());
        act(() => void vi.advanceTimersByTime(1000));
        act(() => FakeWebSocket.instances[1]!.open());

        // Whatever happened while the socket was down was never delivered, so the caller
        // has to be told to re-read.
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('backs off, then resets the delay after a successful connect', () => {
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1' }));
        act(() => FakeWebSocket.instances[0]!.open());

        // 1s, then 2s, then 4s.
        act(() => FakeWebSocket.instances[0]!.drop());
        act(() => void vi.advanceTimersByTime(999));
        expect(FakeWebSocket.instances).toHaveLength(1);
        act(() => void vi.advanceTimersByTime(1));
        expect(FakeWebSocket.instances).toHaveLength(2);

        act(() => FakeWebSocket.instances[1]!.drop());
        act(() => void vi.advanceTimersByTime(1999));
        expect(FakeWebSocket.instances).toHaveLength(2);
        act(() => void vi.advanceTimersByTime(1));
        expect(FakeWebSocket.instances).toHaveLength(3);

        // A connect that succeeds puts the next outage back at one second.
        act(() => FakeWebSocket.instances[2]!.open());
        act(() => FakeWebSocket.instances[2]!.drop());
        act(() => void vi.advanceTimersByTime(1000));
        expect(FakeWebSocket.instances).toHaveLength(4);
    });

    it('caps the backoff so a long outage still recovers on its own', () => {
        renderHook(() => useBattleRoomSocket({ url: 'ws://x', roomId: 'room_1' }));

        for (let attempt = 0; attempt < 12; attempt++) {
            act(() => FakeWebSocket.instances.at(-1)!.drop());
            act(() => void vi.advanceTimersByTime(30_000));
        }

        // Without a cap the delay would have grown past an hour by now.
        expect(FakeWebSocket.instances.length).toBe(13);
    });
});
