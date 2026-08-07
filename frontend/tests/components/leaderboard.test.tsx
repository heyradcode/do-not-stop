import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useChainCapabilities = vi.fn();
const useLeaderboard = vi.fn();
const usePlayerLeaderboard = vi.fn();

const useAuth = vi.fn();

vi.mock('@shared/core', () => ({
    useAuth: () => useAuth(),
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
    useAuth.mockReturnValue({ isAuthenticated: true, signAndLogin: vi.fn() });
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

    // The empty state said "No battles on record yet", which is a claim about the game
    // rather than about the session — wrong, and it left the player with nothing to do.
    it('offers sign-in when the wallet is connected but the session is not', () => {
        useAuth.mockReturnValue({ isAuthenticated: false, signAndLogin: vi.fn() });

        renderBoard();

        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        expect(screen.queryByText(/No battles on record yet/i)).toBeNull();
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


describe('Leaderboard pagination', () => {
    const board = (total: number, page = 0) => ({
        entries: [petEntry({ rank: page * 20 + 1 })],
        total,
        pageSize: 20,
        isLoading: false,
        error: null,
    });

    // The old pager hid itself whenever everything fit, which left a reader unable to
    // tell a short board from a truncated one.
    it('states the range even when there is only one page', () => {
        useLeaderboard.mockReturnValue(board(4));
        usePlayerLeaderboard.mockReturnValue(emptyResult);

        renderBoard();

        expect(screen.getByText('1–4 of 4')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Leaderboard pages' })).toBeNull();
    });

    it('offers a numbered page per page and jumps straight to one', async () => {
        useLeaderboard.mockReturnValue(board(65));
        usePlayerLeaderboard.mockReturnValue(emptyResult);

        renderBoard();
        const nav = screen.getByRole('navigation', { name: 'Leaderboard pages' });

        // 65 rows at 20 a page is four pages, and the first is the one you are on.
        expect(within(nav).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        expect(within(nav).getByRole('button', { name: 'Page 4' })).toBeInTheDocument();

        await userEvent.click(within(nav).getByRole('button', { name: 'Page 3' }));

        // The hook is asked for the page that was pressed, not the next one along.
        expect(useLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    it('keeps both ends reachable on a long board', () => {
        useLeaderboard.mockReturnValue(board(1000));
        usePlayerLeaderboard.mockReturnValue(emptyResult);

        renderBoard();
        const nav = screen.getByRole('navigation', { name: 'Leaderboard pages' });

        // Fifty pages, but a fixed-width strip: the ends, the neighbours, and a gap.
        expect(within(nav).getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
        expect(within(nav).getByRole('button', { name: 'Page 50' })).toBeInTheDocument();
        expect(within(nav).queryByRole('button', { name: 'Page 25' })).toBeNull();
        expect(within(nav).getAllByRole('button').length).toBeLessThan(10);
    });
});
