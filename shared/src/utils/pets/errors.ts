import type { PetAction } from '../../types/pet';

export class NoActiveChainError extends Error {
    constructor(action: PetAction) {
        super(`Action "${action}" requires a connected wallet.`);
        this.name = 'NoActiveChainError';
    }
}
