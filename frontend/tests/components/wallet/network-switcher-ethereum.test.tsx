import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const wagmi = {
    chain: undefined as { id: number } | undefined,
    switchChain: vi.fn(),
    isPending: false,
    switchError: null as { message: string } | null,
};
vi.mock('wagmi', () => ({
    useAccount: () => ({ chain: wagmi.chain }),
    useSwitchChain: () => ({
        switchChain: wagmi.switchChain,
        isPending: wagmi.isPending,
        error: wagmi.switchError,
    }),
}));

vi.mock('@constants/chains/ethereum', () => {
    const CHAINS = [
        { chain: { id: 1 }, name: 'Mainnet', symbol: 'ETH', isTestnet: false },
        { chain: { id: 11155111 }, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
    ];
    return {
        CHAINS,
        getChainsByType: (testnet: boolean) => CHAINS.filter((c) => c.isTestnet === testnet),
        getChainConfig: (id: number) => CHAINS.find((c) => c.chain.id === id),
    };
});

import { EthereumNetworkSwitcher } from '@components/wallet/network-switcher';

beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.clearAllMocks();
    Object.assign(wagmi, { chain: { id: 1 }, isPending: false, switchError: null });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('EthereumNetworkSwitcher', () => {
    it('renders nothing when no chain is connected', () => {
        wagmi.chain = undefined;
        const { container } = render(<EthereumNetworkSwitcher />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the current network name on the trigger', () => {
        render(<EthereumNetworkSwitcher />);
        expect(screen.getByRole('button', { name: /Mainnet/ })).toBeInTheDocument();
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

        await userEvent.click(screen.getByRole('button', { name: /Mainnet/ }));
        expect(screen.getByText('Select Network')).toBeInTheDocument();

        // Current chain's option is marked active.
        const option = screen.getByText('Mainnet', { selector: '.option-name' }).closest('button');
        expect(option).toHaveClass('option', 'active');

        await userEvent.click(option as Element);
        expect(wagmi.switchChain).toHaveBeenCalledWith({ chainId: 1 });
    });

    it('reveals testnets when the toggle is checked', async () => {
        render(<EthereumNetworkSwitcher />);
        await userEvent.click(screen.getByRole('button', { name: /Mainnet/ }));

        expect(screen.queryByText('Sepolia')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('checkbox'));

        expect(screen.getByText('Sepolia')).toBeInTheDocument();
    });
});
