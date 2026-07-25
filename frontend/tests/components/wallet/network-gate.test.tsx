import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const TARGET = 84532;

const wagmi = {
    chainId: TARGET as number | undefined,
    isConnected: true,
    switchChainAsync: vi.fn(),
};
vi.mock('wagmi', () => ({
    useAccount: () => ({ chainId: wagmi.chainId, isConnected: wagmi.isConnected }),
    useSwitchChain: () => ({ switchChainAsync: wagmi.switchChainAsync }),
}));

const dynamic = { primaryWallet: null as { switchNetwork?: unknown } | null };
vi.mock('@dynamic-labs/sdk-react-core', () => ({
    useDynamicContext: () => ({ primaryWallet: dynamic.primaryWallet }),
}));

// Literals, not `TARGET`: vi.mock factories are hoisted above this file's consts.
vi.mock('@constants/chains/ethereum', () => ({
    TARGET_CHAIN_ID: 84532,
    getChainConfig: (id: number) =>
        id === 84532
            ? { chain: { id }, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true }
            : undefined,
    isSupportedChain: (id: number | undefined) => id === 84532 || id === 31337,
}));

import NetworkGate from '@components/wallet/network-gate';

beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.clearAllMocks();
    Object.assign(wagmi, { chainId: TARGET, isConnected: true });
    wagmi.switchChainAsync = vi.fn().mockResolvedValue(undefined);
    dynamic.primaryWallet = null;
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('NetworkGate', () => {
    it('renders nothing when no EVM wallet is connected', () => {
        // Solana-only players must never see an EVM network warning.
        wagmi.isConnected = false;
        wagmi.chainId = 1;
        const { container } = render(<NetworkGate />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing on a supported chain', () => {
        const { container } = render(<NetworkGate />);
        expect(container).toBeEmptyDOMElement();
    });

    it('warns and offers a switch on an unsupported chain', () => {
        wagmi.chainId = 1;
        render(<NetworkGate />);

        expect(screen.getByText(/Crypto Pets runs on Base Sepolia/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Switch to Base Sepolia/ })).toBeInTheDocument();
    });

    it('switches to the target chain on click', async () => {
        wagmi.chainId = 1;
        render(<NetworkGate />);

        await userEvent.click(screen.getByRole('button', { name: /Switch to Base Sepolia/ }));

        expect(wagmi.switchChainAsync).toHaveBeenCalledWith({ chainId: TARGET });
    });

    it("falls back to Dynamic's wallet when wagmi has no connector to act on", async () => {
        wagmi.chainId = 1;
        wagmi.switchChainAsync = vi.fn().mockRejectedValue(new Error('connector not found'));
        const switchNetwork = vi.fn().mockResolvedValue(undefined);
        dynamic.primaryWallet = { switchNetwork };

        render(<NetworkGate />);
        await userEvent.click(screen.getByRole('button', { name: /Switch to Base Sepolia/ }));

        expect(switchNetwork).toHaveBeenCalledWith(TARGET);
    });

    it('explains a rejected request instead of showing the raw error', async () => {
        wagmi.chainId = 1;
        wagmi.switchChainAsync = vi.fn().mockRejectedValue(
            Object.assign(new Error('User rejected the request.'), { code: 4001 }),
        );

        render(<NetworkGate />);
        await userEvent.click(screen.getByRole('button', { name: /Switch to Base Sepolia/ }));

        expect(screen.getByText(/You dismissed the request in your wallet/)).toBeInTheDocument();
    });
});
