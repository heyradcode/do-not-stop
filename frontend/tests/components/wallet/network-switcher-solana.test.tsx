import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const wallet = { connected: false };
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: () => wallet }));

vi.mock('@constants/chains/solana', () => ({
    SOLANA_NETWORKS: [
        { name: 'Solana Local', isTestnet: false },
        { name: 'Devnet', isTestnet: true },
        { name: 'Mainnet', isTestnet: false },
    ],
}));

import { SolanaNetworkSwitcher } from '@components/wallet/network-switcher';

beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    wallet.connected = false;
});
afterEach(() => {
    document.body.innerHTML = '';
});

describe('SolanaNetworkSwitcher', () => {
    it('renders nothing when the wallet is not connected', () => {
        const { container } = render(<SolanaNetworkSwitcher />);
        expect(container).toBeEmptyDOMElement();
    });

    it('defaults the trigger to Solana Local when connected', () => {
        wallet.connected = true;
        render(<SolanaNetworkSwitcher />);
        expect(screen.getByText('Solana Local')).toBeInTheDocument();
    });

    it('opens the network list with the current network marked active', async () => {
        wallet.connected = true;
        render(<SolanaNetworkSwitcher />);

        await userEvent.click(screen.getByRole('button', { name: /Solana Local/ }));

        expect(screen.getByText('Select Solana Network')).toBeInTheDocument();
        const active = screen.getByText('Solana Local', { selector: '.optionName' }).closest('button');
        expect(active).toHaveClass('option', 'active');
    });

    it('switches the displayed network on selection', async () => {
        wallet.connected = true;
        render(<SolanaNetworkSwitcher />);
        await userEvent.click(screen.getByRole('button', { name: /Solana Local/ }));

        await userEvent.click(screen.getByText('Devnet', { selector: '.optionName' }));

        // Modal closed; trigger now reflects the new network.
        expect(screen.queryByText('Select Solana Network')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Devnet/ })).toBeInTheDocument();
    });
});
