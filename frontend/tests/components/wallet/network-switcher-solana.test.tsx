import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const wallet = { connected: false };
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: () => wallet }));

import { SolanaNetworkIndicator } from '@components/wallet/network-switcher';

/**
 * This was a switcher, and its tests pinned the illusion: one asserted that picking a network
 * updated the trigger label, which it did — by setting local state and nothing else. The
 * connection endpoint is fixed at boot from `VITE_SOLANA_CLUSTER`, so the label moved and the
 * app kept talking to the same cluster. It also opened on a hardcoded `'Solana Local'`
 * regardless of what was configured.
 *
 * So the tests now check the opposite property: that the label is derived from the same
 * environment value `AppProviders` passes to `SolanaWalletProvider`, and that there is nothing
 * to click.
 *
 * The real `solanaNetworkNameFromCluster` is used rather than a mocked constants module —
 * the mapping from cluster to label is the thing under test.
 */

beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    wallet.connected = false;
});
afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllEnvs();
});

describe('SolanaNetworkIndicator', () => {
    it('renders nothing when the wallet is not connected', () => {
        vi.stubEnv('VITE_SOLANA_CLUSTER', 'devnet');
        const { container } = render(<SolanaNetworkIndicator />);
        expect(container).toBeEmptyDOMElement();
    });

    // The bug this replaces: a devnet deployment displayed "Solana Local".
    it.each([
        ['devnet', 'Solana Devnet'],
        ['testnet', 'Solana Testnet'],
        ['mainnet-beta', 'Solana Mainnet'],
        ['localnet', 'Solana Local'],
    ])('reports the configured cluster (%s)', (cluster, expected) => {
        wallet.connected = true;
        vi.stubEnv('VITE_SOLANA_CLUSTER', cluster);

        render(<SolanaNetworkIndicator />);

        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    // An unset cluster is localnet by convention, which is what AppProviders resolves too.
    it('falls back to local with no cluster configured', () => {
        wallet.connected = true;
        vi.stubEnv('VITE_SOLANA_CLUSTER', '');

        render(<SolanaNetworkIndicator />);

        expect(screen.getByText('Solana Local')).toBeInTheDocument();
    });

    // The point of the change: nothing here claims to be actionable. A control that appears
    // to switch chains and does not is worse than no control.
    it('offers nothing to press', () => {
        wallet.connected = true;
        vi.stubEnv('VITE_SOLANA_CLUSTER', 'devnet');

        render(<SolanaNetworkIndicator />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Solana Devnet');
    });
});
