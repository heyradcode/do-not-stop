import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { PublicKey } from '@solana/web3.js';

/**
 * The Solana half of the balance readout, which is hand-rolled where the EVM half is wagmi.
 *
 * That asymmetry is where the bugs were. wagmi keeps the previous value during a refetch and
 * keys its cache by address; this polls every ten seconds with a bare `useState`, so it flagged
 * every poll as loading — blinking the number out for as long as the dropdown stayed open —
 * and had nothing to stop a request from a previous wallet landing under the new one.
 */

const wallet: { publicKey: PublicKey | null; connected: boolean } = { publicKey: null, connected: false };
const getBalance = vi.fn();

// One stable object, as the real hook returns. A fresh one per render would make the effect
// re-run on every state change, which re-fetches constantly and hides exactly the polling
// behaviour these tests are about.
const connection = { getBalance };
vi.mock('@solana/wallet-adapter-react', () => ({
    useWallet: () => wallet,
    useConnection: () => ({ connection }),
}));

// The EVM half is not under test here; it must simply not render for type="solana".
vi.mock('wagmi', () => ({
    useAccount: () => ({ address: undefined, isConnected: false, chain: undefined }),
    useBalance: () => ({ data: undefined, isLoading: false, error: null }),
}));

import NativeBalance from '@components/wallet/native-balance';

const WALLET_A = new PublicKey('HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA');
const WALLET_B = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

/** Lamports, so the assertions read in the unit the RPC answers in. */
const SOL = 1_000_000_000;

beforeEach(() => {
    vi.clearAllMocks();
    wallet.publicKey = WALLET_A;
    wallet.connected = true;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('NativeBalance (solana)', () => {
    it('renders nothing without a connected wallet', () => {
        wallet.connected = false;
        wallet.publicKey = null;
        const { container } = render(<NativeBalance type="solana" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the balance in SOL, to four places', async () => {
        getBalance.mockResolvedValue(2.5 * SOL);
        render(<NativeBalance type="solana" />);

        expect(await screen.findByText('2.5000')).toBeInTheDocument();
        expect(screen.getByText('SOL')).toBeInTheDocument();
    });

    it('shows a zero balance rather than hiding it', async () => {
        getBalance.mockResolvedValue(0);
        render(<NativeBalance type="solana" />);

        expect(await screen.findByText('0.0000')).toBeInTheDocument();
    });

    it('reports a failure when it has never had a balance', async () => {
        getBalance.mockRejectedValue(new Error('rpc down'));
        render(<NativeBalance type="solana" />);

        expect(await screen.findByText(/Error loading balance/)).toBeInTheDocument();
    });

    /**
     * The timer advance is wrapped in `act` throughout. A state update from an interval is
     * scheduled but not flushed otherwise, so an assertion right after reads the DOM as it was
     * before the poll — which is how the first draft of these tests passed against the very
     * code they were written to catch.
     */
    describe('while polling', () => {
        beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

        // The number used to blink out every ten seconds, for as long as the dropdown stayed
        // open, because each poll set the loading flag.
        it('keeps the balance on screen across a refresh', async () => {
            getBalance.mockResolvedValue(2.5 * SOL);
            render(<NativeBalance type="solana" />);
            expect(await screen.findByText('2.5000')).toBeInTheDocument();

            // A slow second poll: the balance must survive the whole time it is in flight.
            let release: (value: number) => void = () => {};
            getBalance.mockReturnValue(new Promise<number>((resolve) => { release = resolve; }));
            await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

            expect(screen.getByText('2.5000')).toBeInTheDocument();
            expect(screen.queryByText(/Loading balance/)).not.toBeInTheDocument();

            release(3 * SOL);
            await waitFor(() => expect(screen.getByText('3.0000')).toBeInTheDocument());
        });

        // Same reasoning as the loading flag: a value ten seconds old beats an error box that
        // appears and disappears.
        it('keeps the last balance when a later poll fails', async () => {
            getBalance.mockResolvedValue(2.5 * SOL);
            render(<NativeBalance type="solana" />);
            expect(await screen.findByText('2.5000')).toBeInTheDocument();

            getBalance.mockRejectedValue(new Error('rpc blipped'));
            await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

            expect(screen.getByText('2.5000')).toBeInTheDocument();
            expect(screen.queryByText(/Error loading balance/)).not.toBeInTheDocument();
        });
    });

    // A request from the previous wallet must not land under the new one. wagmi gets this
    // from its query key; here it needs the explicit guard.
    it('does not show a previous wallet\'s balance after a switch', async () => {
        let release: (value: number) => void = () => {};
        getBalance.mockReturnValue(new Promise<number>((resolve) => { release = resolve; }));

        const { rerender } = render(<NativeBalance type="solana" />);

        wallet.publicKey = WALLET_B;
        getBalance.mockResolvedValue(9 * SOL);
        rerender(<NativeBalance type="solana" />);

        // Wallet A's reply arrives late, after the switch.
        release(1 * SOL);

        expect(await screen.findByText('9.0000')).toBeInTheDocument();
        expect(screen.queryByText('1.0000')).not.toBeInTheDocument();
    });
});
