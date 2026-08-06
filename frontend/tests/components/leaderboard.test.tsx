import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useChainCapabilities = vi.fn();
const useLeaderboard = vi.fn();
const usePlayerLeaderboard = vi.fn();

vi.mock('@shared/core', () => ({
    // `@utils/address` normalizes through the protocol helper; the real one, since the
    // EVM-folds/base58-doesn't rule is what several of these assertions are about.
    normalizeAccount: (value: string) => (/^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value),
    useChainCapabilities: () => useChainCapabilities(),
    useLeaderboard: (opts: unknown) => useLeaderboard(opts),
    usePlayerLeaderboard: (opts: unknown) => usePlayerLeaderboard(opts),
    // PetArt reads these; the leaderboard only ever renders the emoji fallback here,
    // since VITE_IMAGE_SERVICE_URL is unset in tests.
    getPetAvatar: () => '🐾',
    petArtUrl: () => null,
}));

import Leaderboard from '@components/leaderboard';

const YOU = '0xAAAAbbbbCCCCddddEEEEffff0000111122223333';

const petEntry = (over: Partial<Record<string, unknown>> = {}) => ({
    rank: 1,
    id: '1',
    chain: 'evm',
    owner: YOU.toLowerCase(),
    name: 'Yasu',
    dna: '9464978781602373',
    level: 2,
    rarity: 2,
    winCount: 5,
    lossCount: 2,
    asset: '',
    ...over,
});

const emptyResult = { entries: [], total: 0, pageSize: 20, isLoading: false, error: null };

const renderBoard = () =>
    render(
        <MemoryRouter initialEntries={['/leaderboard']}>
            <Leaderboard />
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    useChainCapabilities.mockReturnValue({
        isConnected: true,
        activeKind: 'evm',
        walletAddress: YOU,
    });
    useLeaderboard.mockReturnValue(emptyResult);
    usePlayerLeaderboard.mockReturnValue(emptyResult);
});

describe('Leaderboard', () => {
    it('asks for a wallet before showing rankings', () => {
        useChainCapabilities.mockReturnValue({
            isConnected: false,
            activeKind: null,
            walletAddress: null,
        });

        renderBoard();

        expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
    });

    it('renders a pet row with its record and win rate', () => {
        useLeaderboard.mockReturnValue({ ...emptyResult, entries: [petEntry()], total: 1 });

        renderBoard();

        const row = screen.getByText('Yasu').closest('li') as HTMLElement;
        expect(within(row).getByText('5W')).toBeInTheDocument();
        expect(within(row).getByText('2L')).toBeInTheDocument();
        // 5 of 7 fights, rounded.
        expect(within(row).getByText('71%')).toBeInTheDocument();
    });

    it('medals the top three and numbers the rest, using the absolute rank', () => {
        useLeaderboard.mockReturnValue({
            ...emptyResult,
            entries: [
                petEntry({ rank: 21, id: '21', name: 'Twenty-first' }),
                petEntry({ rank: 22, id: '22', name: 'Twenty-second' }),
            ],
            total: 40,
        });

        renderBoard();

        // Page 2 rows are not medalled: rank is absolute, not per-page.
        expect(screen.getByText('#21')).toBeInTheDocument();
        expect(screen.queryByText('🥇')).toBeNull();
    });

    it('highlights the connected wallet regardless of address case', () => {
        // The backend groups EVM owners lowercased; the wallet reports mixed case.
        useLeaderboard.mockReturnValue({
            ...emptyResult,
            entries: [petEntry(), petEntry({ rank: 2, id: '2', name: 'Someone else', owner: '0xdead' })],
            total: 2,
        });

        renderBoard();

        const mine = screen.getByText('Yasu').closest('li') as HTMLElement;
        const theirs = screen.getByText('Someone else').closest('li') as HTMLElement;
        expect(mine.className).not.toEqual(theirs.className);
    });

    it('switches to the player board and back to the first page', async () => {
        useLeaderboard.mockReturnValue({ ...emptyResult, entries: [petEntry()], total: 1 });
        usePlayerLeaderboard.mockReturnValue({
            ...emptyResult,
            entries: [{ rank: 1, owner: YOU.toLowerCase(), winCount: 8, lossCount: 4, petCount: 3 }],
            total: 1,
        });

        renderBoard();
        await userEvent.click(screen.getByRole('tab', { name: 'Players' }));

        expect(screen.getByText('3 pets')).toBeInTheDocument();
        expect(screen.getByText('8W')).toBeInTheDocument();
        // Only the visible board is fetched, so the idle one costs nothing.
        expect(usePlayerLeaderboard).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 0, enabled: true }),
        );
        expect(useLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('says so when nothing has been fought yet', () => {
        renderBoard();
        expect(screen.getByText(/No battles on record yet/i)).toBeInTheDocument();
    });

    it('shows the failure instead of an empty board', () => {
        useLeaderboard.mockReturnValue({ ...emptyResult, error: new Error('backend unreachable') });

        renderBoard();

        expect(screen.getByText('backend unreachable')).toBeInTheDocument();
    });
});
