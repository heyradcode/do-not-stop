import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useChainCapabilities = vi.fn();
const useRewardSeasons = vi.fn();
const useRewardSeason = vi.fn();
const useRewardClaim = vi.fn();
const useRewardsAdapter = vi.fn();

vi.mock('@shared/core', () => ({
    useChainCapabilities: () => useChainCapabilities(),
    useRewardSeasons: () => useRewardSeasons(),
    useRewardSeason: (id: number | null) => useRewardSeason(id),
    useRewardClaim: (id: number | null, wallet: string | null) => useRewardClaim(id, wallet),
    useRewardsAdapter: () => useRewardsAdapter(),
}));

import Rewards from '../../src/components/rewards';

/**
 * The rewards screen exists to keep three outcomes apart that a naive version merges:
 * earned nothing, could not find out, and nothing to claim against yet. Each is a separate
 * message and only one of them offers a button, so each gets a test.
 */

const SEASONS = [
    { seasonId: 2, chainId: 'solana:devnet', deploymentId: 'd', token: 'Mint', totalAmount: '500', openedAt: '2026-08-01' },
    { seasonId: 1, chainId: 'eip155:84532', deploymentId: 'd', token: '0xtok', totalAmount: '900', openedAt: '2026-07-01' },
];

const SEASON = {
    seasonId: 2,
    chainId: 'solana:devnet',
    distributor: 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh',
    token: 'Mint',
    evmChainId: null,
    chainRef: 'Genesis',
    openedAt: '2026-08-01',
};

const CLAIM = { seasonId: 2, wallet: 'Wallet', amount: '1250000', proof: ['0xab'], breakdown: {} };

const claimMutate = vi.fn();

function adapter(over: Record<string, unknown> = {}) {
    return {
        kind: 'solana',
        canClaim: true,
        claim: {
            mutateAsync: claimMutate,
            lifecycle: { phase: 'idle', error: null, reset: vi.fn() },
            isPending: false,
        },
        ...over,
    };
}

const view = () =>
    render(
        <MemoryRouter>
            <Rewards />
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    useChainCapabilities.mockReturnValue({ walletAddress: 'Wallet' });
    useRewardSeasons.mockReturnValue({ data: SEASONS, isLoading: false, error: null });
    useRewardSeason.mockReturnValue({ data: SEASON, isLoading: false, error: null });
    useRewardClaim.mockReturnValue({ data: CLAIM, isLoading: false, error: null, refetch: vi.fn() });
    useRewardsAdapter.mockReturnValue(adapter());
    claimMutate.mockResolvedValue(undefined);
});

describe('season discovery', () => {
    it('lists every season and defaults to the newest', () => {
        view();

        expect(screen.getByText('Season 2')).toBeInTheDocument();
        expect(screen.getByText('Season 1')).toBeInTheDocument();
        // The list arrives newest-first, so the first entry is the default selection.
        expect(useRewardSeason).toHaveBeenCalledWith(2);
    });

    it('switches the detail pane when another season is picked', async () => {
        view();

        await userEvent.click(screen.getByText('Season 1'));

        expect(useRewardSeason).toHaveBeenLastCalledWith(1);
    });

    it('says so when nothing has been published', () => {
        useRewardSeasons.mockReturnValue({ data: [], isLoading: false, error: null });
        view();

        expect(screen.getByText(/No seasons have been published/i)).toBeInTheDocument();
    });
});

describe('the three outcomes it must not merge', () => {
    it('renders no entitlement as an answer, not an error', () => {
        useRewardClaim.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn() });
        view();

        expect(screen.getByText(/Nothing to claim/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
    });

    // The distinction that matters: a failed lookup is not "you earned nothing".
    it('renders a failed lookup as a failure, not as nothing earned', () => {
        useRewardClaim.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom'), refetch: vi.fn() });
        view();

        expect(screen.getByText(/Could not check your entitlement/i)).toBeInTheDocument();
        expect(screen.queryByText(/Nothing to claim/i)).not.toBeInTheDocument();
    });

    // A season with no root on chain has nothing to claim against, so offering a button
    // would produce a transaction that reverts.
    it('offers no button while the season has no root on chain', () => {
        useRewardSeason.mockReturnValue({ data: { ...SEASON, openedAt: null }, isLoading: false, error: null });
        view();

        expect(screen.getByText(/not on chain yet/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument();
    });
});

describe('claiming', () => {
    it('shows the amount grouped, in the token base unit', () => {
        view();

        expect(screen.getByText('1,250,000')).toBeInTheDocument();
        expect(screen.getByText(/smallest unit/i)).toBeInTheDocument();
    });

    // The distributor and token come from the season, never from config: a proof is bound to
    // one distributor, so aiming it elsewhere fails after the wallet prompt.
    it('claims against the distributor the season names', async () => {
        view();

        await userEvent.click(screen.getByRole('button', { name: /^claim$/i }));

        expect(claimMutate).toHaveBeenCalledWith(
            expect.objectContaining({
                seasonId: 2,
                wallet: 'Wallet',
                amount: '1250000',
                distributor: SEASON.distributor,
                token: 'Mint',
            }),
        );
    });

    it('prompts to connect when no wallet is attached', () => {
        useChainCapabilities.mockReturnValue({ walletAddress: null });
        view();

        expect(screen.getByText(/Connect a wallet to see/i)).toBeInTheDocument();
    });

    it('disables the button and reports the phase while a claim is in flight', () => {
        useRewardsAdapter.mockReturnValue(
            adapter({
                claim: {
                    mutateAsync: claimMutate,
                    lifecycle: { phase: 'awaiting-wallet', error: null, reset: vi.fn() },
                    isPending: true,
                },
            }),
        );
        view();

        const button = screen.getByRole('button', { name: /Confirm in your wallet/i });
        expect(button).toBeDisabled();
    });

    it('surfaces a rejected claim', () => {
        useRewardsAdapter.mockReturnValue(
            adapter({
                claim: {
                    mutateAsync: claimMutate,
                    lifecycle: { phase: 'error', error: new Error('already claimed'), reset: vi.fn() },
                    isPending: false,
                },
            }),
        );
        view();

        expect(screen.getByText('already claimed')).toBeInTheDocument();
    });
});
