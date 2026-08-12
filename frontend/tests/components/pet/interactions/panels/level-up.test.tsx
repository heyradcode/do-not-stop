import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const levelUpPet = {
    mutate: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: vi.fn(),
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;

const petList = {
    pets: [
        { id: '1', name: 'Alpha', level: 2 },
        { id: '2', name: 'Beta', level: 5 },
    ],
    refetch: vi.fn(),
};
/**
 * `levelUpFeeFor` is the chain's own curve. EVM scales quadratically, Solana charges the
 * base fee flat, and the panel must quote whichever one is active — the flat default here,
 * overridden per test.
 */
const capabilities = {
    levelUpFee: null as { amount: number; symbol: string } | null,
    levelUpFeeFor: (baseFee: bigint, _level: number) => baseFee,
    isConnected: true,
};
const fees = { levelUpFee: undefined as bigint | undefined, symbol: null as 'ETH' | 'SOL' | null };

const EVM_CURVE = (baseFee: bigint, level: number) => {
    const diff = BigInt(Math.max(level - 1, 0));
    return (baseFee * (100n + diff * diff)) / 100n;
};

vi.mock('@shared/core', () => ({
    getPetAvatar: () => '🐉',
    // No art service in these tests: PetArt renders the emoji alone.
    petArtUrl: () => null,
    getPetClass: () => 'Warrior',
    getXpNumbers: () => ({ xpCurrent: 10, xpMax: 100 }),
    getXpPercent: () => 10,
    getReadyPetsUnified: (pets: { id: string; level: number }[]) => pets.map((p) => ({ id: p.id, pet: p })),
    useChainCapabilities: () => capabilities,
    useFees: () => ({
        ...fees,
        // Symbol-suffixed like the real formatter, so an assertion on the button label
        // reads as the player sees it.
        formatAmount: (v: bigint) => (fees.symbol ? `${v} ${fees.symbol}` : `${v}`),
        formatAmountOnly: (v: bigint) => String(v),
    }),
    usePetList: () => petList,
    useLevelUpPet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return levelUpPet;
    },
    useSyncMetadata: () => ({ sync: vi.fn(), isPending: false, error: null }),
}));

import LevelUpPanel from '@components/pet/interactions/panels/level-up';

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.levelUpFee = null;
    capabilities.levelUpFeeFor = (baseFee: bigint) => baseFee;
    fees.levelUpFee = undefined;
    fees.symbol = null;
    levelUpPet.isPending = false;
});


/**
 * Picks a pet from `PetPicker`: every pet is a visible tile, so this is one click on the
 * tile rather than opening anything.
 */
async function choosePet(name: string) {
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
}

describe('LevelUpPanel', () => {
    it('shows every ready pet as a tile, with no menu to open', () => {
        render(<LevelUpPanel />);

        expect(screen.getByRole('radio', { name: /Alpha/ })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Beta/ })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Lv 2/ })).toBeInTheDocument();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('marks only the chosen pet as selected', async () => {
        render(<LevelUpPanel />);
        await choosePet('Beta');

        expect(screen.getByRole('radio', { name: /Beta/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /Alpha/ })).not.toBeChecked();
    });

    // "from" is a promise that the price climbs. Solana's `level_up` transfers a flat
    // lamport fee and never reads the level, so hedging there quotes a range that does not
    // exist. EVM's does climb, and says so.
    it('labels a flat fee without hedging it', () => {
        capabilities.levelUpFee = { amount: 5, symbol: 'SOL' };
        fees.levelUpFee = 5n;
        fees.symbol = 'SOL';
        render(<LevelUpPanel />);
        expect(screen.getByRole('button', { name: 'Level Up (5 SOL)' })).toBeInTheDocument();
    });

    it('says "from" only where the fee rises with level', () => {
        capabilities.levelUpFee = { amount: 5, symbol: 'ETH' };
        capabilities.levelUpFeeFor = EVM_CURVE;
        fees.levelUpFee = 5n;
        fees.symbol = 'ETH';
        render(<LevelUpPanel />);
        expect(screen.getByRole('button', { name: 'Level Up (from 5 ETH)' })).toBeInTheDocument();
    });

    // The bug this guards: the panel used to apply EVM's quadratic curve on every chain,
    // so a level-5 Solana pet was quoted 1.16x what its wallet would actually be debited.
    it('quotes the selected pet at the active chain\'s own curve', async () => {
        capabilities.levelUpFee = { amount: 100, symbol: 'SOL' };
        fees.levelUpFee = 100n;
        fees.symbol = 'SOL';
        render(<LevelUpPanel />);
        await choosePet('Beta'); // level 5

        expect(screen.getByRole('button', { name: 'Level Up (100 SOL)' })).toBeInTheDocument();
    });

    it('quotes the EVM curve for the same pet', async () => {
        capabilities.levelUpFee = { amount: 100, symbol: 'ETH' };
        capabilities.levelUpFeeFor = EVM_CURVE;
        fees.levelUpFee = 100n;
        fees.symbol = 'ETH';
        render(<LevelUpPanel />);
        await choosePet('Beta'); // level 5 → (100 + 16) / 100 × 100 = 116

        expect(screen.getByRole('button', { name: 'Level Up (116 ETH)' })).toBeInTheDocument();
    });

    it('falls back to a plain label with no fee', () => {
        render(<LevelUpPanel />);
        expect(screen.getByRole('button', { name: 'Level Up' })).toBeInTheDocument();
    });

    it('keeps the submit disabled until a pet is selected', async () => {
        render(<LevelUpPanel />);
        const submit = screen.getByRole('button', { name: 'Level Up' });
        expect(submit).toBeDisabled();

        await choosePet('Beta');
        expect(submit).toBeEnabled();
    });

    it('submits the level-up mutation for the chosen pet', async () => {
        render(<LevelUpPanel />);
        await choosePet('Beta');
        await userEvent.click(screen.getByRole('button', { name: 'Level Up' }));

        expect(levelUpPet.reset).toHaveBeenCalled();
        expect(levelUpPet.mutate).toHaveBeenCalledWith({ petId: '2' });
    });

    it('shows success once settled', () => {
        render(<LevelUpPanel />);

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet leveled up successfully!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });
});
