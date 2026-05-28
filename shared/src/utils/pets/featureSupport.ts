import type { PetAction, PetChain } from '../../types/pet';

const SUPPORT: Record<PetChain, Record<PetAction, boolean>> = {
    evm: {
        create: true,
        levelUp: true,
        rename: true,
        battle: true,
        breed: true,
        transfer: true,
    },
    solana: {
        create: true,
        levelUp: true,
        rename: true,
        battle: true,
        breed: true,
        transfer: true,
    },
};

export function isActionSupported(chain: PetChain | null, action: PetAction): boolean {
    if (!chain) return false;
    return SUPPORT[chain][action];
}
