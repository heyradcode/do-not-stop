import { NoActiveChainError } from '../../utils/pets/errors';
import type { PetAction } from '../../types/pet';
import type { ChainAdapter, AdapterMutation, ChainCapabilities } from './types';

const NONE_CAPABILITIES: ChainCapabilities = {
    chainLabel: '',
    address: { label: 'Recipient Address:', placeholder: '', isValid: () => false },
    levelUpFee: null,
    renameMinLevel: 1,
    randomness: { provider: 'chainlink', appliesTo: [] },
    explorerTxUrl: () => null,
    parseError: (_err, fallback) => ({ message: fallback, isUserRejection: false, isContractError: false }),
};

const disconnectedMutation = <TArgs, TResult = void>(action: PetAction): AdapterMutation<TArgs, TResult> => {
    return {
        mutateAsync: async (): Promise<TResult> => { throw new NoActiveChainError(action); },
        lifecycle: { phase: 'idle', error: null, reset: () => undefined },
        isPending: false,
    };
};

export const noneAdapter: ChainAdapter = {
    kind: 'none',
    address: null,
    isConnected: false,
    capabilities: NONE_CAPABILITIES,
    pets: { data: [], isLoading: false, error: null, refetch: () => undefined },
    createPet:   disconnectedMutation('create'),
    levelUpPet:  disconnectedMutation('levelUp'),
    trainPet:    disconnectedMutation('train'),
    renamePet:   disconnectedMutation('rename'),
    transferPet: disconnectedMutation('transfer'),
    battlePets:  disconnectedMutation('battle'),
    breedPets:   disconnectedMutation('breed'),
};
