import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const wagmi = {
    chainId: undefined as number | undefined,
    isConnected: true,
    switchChain: vi.fn(),
    isPending: false,
    switchError: null as { message: string } | null,
};
vi.mock('wagmi', () => ({
    useAccount: () => ({ chainId: wagmi.chainId, isConnected: wagmi.isConnected }),
    useSwitchChain: () => ({
        switchChain: wagmi.switchChain,
        isPending: wagmi.isPending,
        error: wagmi.switchError,
    }),
}));

vi.mock('@constants/chains/ethereum', () => {
    const CHAINS = [
        { chain: { id: 84532 }, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },
        { chain: { id: 31337 }, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true },
    ];
    return {
        CHAINS,
        getChainConfig: (id: number) => CHAINS.find((c) => c.chain.id === id),
    };
});

import { EthereumNetworkSwitcher } from '@components/wallet/network-switcher';

beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.clearAllMocks();
    Object.assign(wagmi, {
        chainId: 84532,
        isConnected: true,
        isPending: false,
        switchError: null,
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('EthereumNetworkSwitcher', () => {
    it('renders nothing when no wallet is connected', () => {
        wagmi.isConnected = false;
        const { container } = render(<EthereumNetworkSwitcher />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the current network name on the trigger', () => {
        render(<EthereumNetworkSwitcher />);
        expect(screen.getByRole('button', { name: /Base Sepolia/ })).toBeInTheDocument();
    });

    // Regression: this used to return null on an unconfigured chain, hiding the
    // one control that could switch back to a supported one.
    it('stays visible and reads "Wrong network" on an unsupported chain', () => {
        wagmi.chainId = 1; // Ethereum mainnet, no deployment
        render(<EthereumNetworkSwitcher />);
        expect(screen.getByRole('button', { name: /Wrong network/ })).toBeInTheDocument();
    });

    it('shows a switching state and disables the trigger while pending', () => {
        wagmi.isPending = true;
        render(<EthereumNetworkSwitcher />);
        expect(screen.getByRole('button', { name: /Switching/ })).toBeDisabled();
    });

    it('surfaces a switch error', () => {
        wagmi.switchError = { message: 'user rejected' };
        render(<EthereumNetworkSwitcher />);
        expect(screen.getByText(/Error: user rejected/)).toBeInTheDocument();
    });

    it('opens the modal and switches chain on selection', async () => {
        render(<EthereumNetworkSwitcher />);

        await userEvent.click(screen.getByRole('button', { name: /Base Sepolia/ }));
        expect(screen.getByText('Select Network')).toBeInTheDocument();

        // Current chain's option is marked active.
        const option = screen
            .getByText('Base Sepolia', { selector: '.optionName' })
            .closest('button');
        expect(option).toHaveClass('option', 'active');

        await userEvent.click(option as Element);
        expect(wagmi.switchChain).toHaveBeenCalledWith({ chainId: 84532 });
    });

    it('offers every supported chain, not just the current one', async () => {
        render(<EthereumNetworkSwitcher />);
        await userEvent.click(screen.getByRole('button', { name: /Base Sepolia/ }));

        expect(screen.getByText('Hardhat Local', { selector: '.optionName' })).toBeInTheDocument();
    });
});
