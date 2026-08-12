import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- External wallet/auth wiring, all mocked and individually controllable. ---
const account = { address: undefined as string | undefined, isConnected: false, chain: { id: 1 } };
const solana = { publicKey: null as { toString(): string } | null, connected: false, disconnect: vi.fn() };
const dynamic = {
    setShowAuthFlow: vi.fn(),
    handleLogOut: vi.fn(),
    user: null as unknown,
    primaryWallet: null as { address: string } | null,
};
const auth = {
    isAuthenticated: false,
    logout: vi.fn(),
    signAndLogin: vi.fn(),
    isSigning: false,
    isVerifying: false,
    isNonceLoading: false,
};

vi.mock('wagmi', () => ({
    useAccount: () => account,
    useReadContracts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: () => solana }));
vi.mock('@dynamic-labs/sdk-react-core', () => ({ useDynamicContext: () => dynamic }));
vi.mock('@shared/core', () => ({ useAuth: () => auth }));
vi.mock('@constants/tokens', () => ({ getPopularTokens: () => [] }));
// Heavy children stubbed so the dropdown is isolated from their wagmi/solana deps.
vi.mock('@components/wallet/native-balance', () => ({ default: () => <div data-testid="native-balance" /> }));
vi.mock('@components/wallet/network-switcher', () => ({
    EthereumNetworkSwitcher: () => <div data-testid="eth-switcher" />,
    SolanaNetworkIndicator: () => <div data-testid="sol-network" />,
}));

import AccountDropdown from '@components/wallet/account-dropdown';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(account, { address: undefined, isConnected: false, chain: { id: 1 } });
    Object.assign(solana, { publicKey: null, connected: false });
    Object.assign(dynamic, { user: null, primaryWallet: null });
    Object.assign(auth, { isAuthenticated: false, isSigning: false, isVerifying: false, isNonceLoading: false });
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('AccountDropdown (no wallet)', () => {
    it('shows a connect button that opens the auth flow', async () => {
        render(<AccountDropdown />);

        const btn = screen.getByRole('button', { name: 'Connect Wallet' });
        await userEvent.click(btn);
        expect(dynamic.setShowAuthFlow).toHaveBeenCalledWith(true);
    });
});

describe('AccountDropdown (EVM connected)', () => {
    beforeEach(() => {
        account.address = '0x1234567890abcdef';
        account.isConnected = true;
    });

    it('renders the shortened address as the trigger and toggles the menu', async () => {
        render(<AccountDropdown />);

        const trigger = screen.getByRole('button', { name: /0x1234\.\.\.cdef/ });
        expect(screen.queryByText('0x1234567890abcdef')).not.toBeInTheDocument();

        await userEvent.click(trigger);

        // Full address now visible inside the open menu.
        expect(screen.getByText('0x1234567890abcdef')).toBeInTheDocument();
        expect(screen.getByText('Ethereum Balance')).toBeInTheDocument();
    });

    it('offers the sign-in action when not authenticated', async () => {
        render(<AccountDropdown />);
        await userEvent.click(screen.getByRole('button', { name: /0x1234\.\.\.cdef/ }));

        await userEvent.click(screen.getByRole('button', { name: 'Sign Message & Login' }));
        expect(auth.signAndLogin).toHaveBeenCalledOnce();
    });

    it('logs out when authenticated', async () => {
        auth.isAuthenticated = true;
        render(<AccountDropdown />);
        await userEvent.click(screen.getByRole('button', { name: /0x1234\.\.\.cdef/ }));

        await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
        expect(auth.logout).toHaveBeenCalledOnce();
    });

    it('disconnects via the dynamic session', async () => {
        render(<AccountDropdown />);
        await userEvent.click(screen.getByRole('button', { name: /0x1234\.\.\.cdef/ }));

        await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
        expect(dynamic.handleLogOut).toHaveBeenCalledOnce();
    });

    it('copies the address to the clipboard', async () => {
        const { container } = render(<AccountDropdown />);
        await userEvent.click(screen.getByRole('button', { name: /0x1234\.\.\.cdef/ }));

        const addressRow = container.querySelector('.address');
        await userEvent.click(addressRow as Element);

        expect(writeText).toHaveBeenCalledWith('0x1234567890abcdef');
    });
});
