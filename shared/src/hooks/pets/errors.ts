import type { PetChain } from '../../types/pet';

export type PetAction =
    | 'create'
    | 'levelUp'
    | 'rename'
    | 'battle'
    | 'breed'
    | 'transfer';

export class FeatureNotSupportedError extends Error {
    readonly chain: PetChain;
    readonly action: PetAction;

    constructor(chain: PetChain, action: PetAction) {
        super(`Action "${action}" is not supported on ${chain}.`);
        this.name = 'FeatureNotSupportedError';
        this.chain = chain;
        this.action = action;
    }
}

export class NoActiveChainError extends Error {
    constructor(action: PetAction) {
        super(`Action "${action}" requires a connected wallet.`);
        this.name = 'NoActiveChainError';
    }
}
