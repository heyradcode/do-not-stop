/**
 * `shared`'s battleEvidence module falls back to a no-op store when it finds no
 * Web Storage, which React Native has none of — so mobile was dropping the signed
 * commitment that proves the drand round was chosen before the randomness existed
 * (§E, §J). The point of a local copy is that the player's evidence does not
 * depend on the backend continuing to serve it, so "silently kept nothing" is the
 * failure this store exists to prevent.
 *
 * The real `saveBattleEvidence` / `readBattleEvidence` run here: a fake would test
 * the fake, and the contract under test is precisely that shared can use this
 * store through its synchronous interface.
 */

const mockDisk = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getAllKeys: jest.fn(async () => [...mockDisk.keys()]),
        multiGet: jest.fn(async (keys: string[]) =>
            keys.map((k) => [k, mockDisk.get(k) ?? null]),
        ),
        setItem: jest.fn(async (k: string, v: string) => {
            mockDisk.set(k, v);
        }),
        removeItem: jest.fn(async (k: string) => {
            mockDisk.delete(k);
        }),
    },
}));

jest.mock('@shared/core', () => jest.requireActual('../../shared/src/utils/battleEvidence'));

import {
    forgetBattleEvidence,
    listBattleEvidenceIds,
    readBattleEvidence,
    saveBattleEvidence,
    setEvidenceStore,
    type BattleEvidence,
} from '../../shared/src/utils/battleEvidence';
import {
    battleEvidenceStore,
    hydrateBattleEvidence,
    resetBattleEvidenceCache,
} from '../src/utils/battleEvidenceStore';

const evidence = (battleId: string): BattleEvidence => ({
    battleId,
    commitmentHash: `0xhash-${battleId}`,
    signature: `0xsig-${battleId}`,
    signingKeyId: 'key-1',
    commitment: { round: 42, battleId },
    storedAt: 1_700_000_000_000,
});

/** AsyncStorage writes are fire-and-forget; let their microtasks land. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    mockDisk.clear();
    resetBattleEvidenceCache();
    setEvidenceStore(battleEvidenceStore);
});

afterAll(() => {
    setEvidenceStore(null);
});

describe('battleEvidenceStore', () => {
    it('round-trips evidence through shared, which a no-op store cannot', async () => {
        saveBattleEvidence(evidence('battle-1'));
        expect(readBattleEvidence('battle-1')).toMatchObject({
            battleId: 'battle-1',
            commitmentHash: '0xhash-battle-1',
        });
        expect(listBattleEvidenceIds()).toEqual(['battle-1']);
    });

    it('reads synchronously, because shared has no async path to await', () => {
        // The whole reason for the memory layer: `getItem` must answer immediately.
        saveBattleEvidence(evidence('battle-2'));
        expect(battleEvidenceStore.getItem('cryptopets.battle-evidence.battle-2')).toContain(
            'battle-2',
        );
    });

    it('persists to AsyncStorage so evidence survives a relaunch', async () => {
        saveBattleEvidence(evidence('battle-3'));
        await settle();

        // Simulate a fresh launch: memory gone, disk intact.
        resetBattleEvidenceCache();
        expect(readBattleEvidence('battle-3')).toBeNull();

        await hydrateBattleEvidence();
        expect(readBattleEvidence('battle-3')).toMatchObject({ battleId: 'battle-3' });
        expect(listBattleEvidenceIds()).toEqual(['battle-3']);
    });

    it('does not let hydration overwrite evidence saved since launch', async () => {
        mockDisk.set(
            'cryptopets.battle-evidence.battle-4',
            JSON.stringify(evidence('battle-4')),
        );
        resetBattleEvidenceCache();

        // A battle accepted before hydration finished: this copy is the newer one.
        const fresh = { ...evidence('battle-4'), commitmentHash: '0xfresher' };
        saveBattleEvidence(fresh);
        await hydrateBattleEvidence();

        expect(readBattleEvidence('battle-4')?.commitmentHash).toBe('0xfresher');
    });

    it('forgets evidence on both layers', async () => {
        saveBattleEvidence(evidence('battle-5'));
        await settle();

        forgetBattleEvidence('battle-5');
        await settle();

        expect(readBattleEvidence('battle-5')).toBeNull();
        expect(listBattleEvidenceIds()).toEqual([]);
        expect(mockDisk.has('cryptopets.battle-evidence.battle-5')).toBe(false);
    });

    it('ignores unrelated AsyncStorage keys when hydrating', async () => {
        mockDisk.set('authToken', 'not-evidence');
        mockDisk.set('cryptopets.battle-evidence.battle-6', JSON.stringify(evidence('battle-6')));
        resetBattleEvidenceCache();

        await hydrateBattleEvidence();

        expect(readBattleEvidence('battle-6')).not.toBeNull();
        expect(battleEvidenceStore.getItem('authToken')).toBeNull();
    });

    it('survives a failing disk rather than breaking the battle', async () => {
        const AsyncStorage = jest.requireMock(
            '@react-native-async-storage/async-storage',
        ).default;
        AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

        expect(() => saveBattleEvidence(evidence('battle-7'))).not.toThrow();
        await settle();
        // The in-memory copy still answers for this session.
        expect(readBattleEvidence('battle-7')).toMatchObject({ battleId: 'battle-7' });
    });
});
