/**
 * Guards the ABI copy. The JSONs are copied verbatim from `frontend/src/chains/ethereum/`
 * rather than regenerated, so nothing mechanical keeps them in step with that source; a
 * truncated or stale copy would break every read at runtime with a decode error rather
 * than at build time.
 *
 * Addresses are asserted by shape, not value: `react-native-dotenv` inlines `@env` at
 * Babel transform time, so the values here come from whichever `.env` this machine has.
 */

import type { AbiFunction } from 'viem';

import { evmContracts } from '../src/chains/ethereum/contracts';

const fnNames = (abi: readonly unknown[]): string[] =>
    (abi as AbiFunction[]).filter((e) => e.type === 'function').map((e) => e.name);

describe('evmContracts', () => {
    it('exposes the three v2 units', () => {
        expect(Object.keys(evmContracts)).toEqual(['petCore', 'gameLogic', 'gameConfig']);
    });

    it.each(['petCore', 'gameLogic', 'gameConfig'] as const)('%s has an address and an abi', (key) => {
        const contract = evmContracts[key];
        expect(contract.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(contract.abi.length).toBeGreaterThan(0);
    });

    it('carries the PetCore surface the pet hooks read', () => {
        expect(fnNames(evmContracts.petCore.abi)).toEqual(
            expect.arrayContaining(['getByOwner', 'getPet', 'totalPets', 'levelUp', 'changeName']),
        );
    });

    it('carries the entropy-era GameLogic surface', () => {
        // The older Sepolia stack's GameLogic predates this and reverts on entropy().
        // If these ever go missing, the ABI has been copied from a pre-entropy build.
        expect(fnNames(evmContracts.gameLogic.abi)).toEqual(
            expect.arrayContaining(['entropy', 'requestMintStarter', 'settleMint', 'requestCreateFromDNA']),
        );
    });

    it('has no battleFee, because battles left the chain', () => {
        // §L Phase 6 retired GameConfig.battleFee with the on-chain battle path.
        // Its return would mean the ABI came from a pre-retirement build.
        expect(fnNames(evmContracts.gameConfig.abi)).not.toContain('battleFee');
        expect(fnNames(evmContracts.gameConfig.abi)).toEqual(
            expect.arrayContaining(['breedFee', 'levelUpFee', 'trainFee', 'baseMintFee']),
        );
    });
});
