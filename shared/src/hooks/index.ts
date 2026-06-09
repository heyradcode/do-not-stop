// Auth callback — consumed by app bootstrap code (e.g. frontend/src/config.ts).
export { setTokenSuccessCallback } from './chains/ethereum/useVerifySignature';
// Low-level EVM read hook — consumed by mobile until it migrates to usePetList.
export { usePetsContract } from './chains/ethereum/usePetsContract';

export { useActiveChain, type ActiveChain } from './useActiveChain';
export { useChainCapabilities, type ChainContext } from './useChainCapabilities';
export type { TxLifecycle, TxPhase, ChainCapabilities } from './adapters/types';
export { usePetList, type PetListResult } from './usePetList';
export { useCreatePet, type CreatePetArgs, type PetMutationResult } from './useCreatePet';
export { useLevelUpPet, type LevelUpPetArgs } from './useLevelUpPet';
export { useRenamePet, type RenamePetArgs } from './useRenamePet';
export {
    useBattlePets,
    type BattlePetsArgs,
    type UseBattlePetsOptions,
} from './useBattlePets';
export {
    useBreedPets,
    type BreedPetsArgs,
    type UseBreedPetsOptions,
} from './useBreedPets';
export { useTransferPet, type TransferPetArgs } from './useTransferPet';
export { useOpponents, type UseOpponentsOptions } from './useOpponents';
export {
    useBattleDialogue,
    type UseBattleDialogueOptions,
    type DialogueTurn,
    type DialoguePetInput,
    type DialogueSpeaker,
    type DialoguePhase,
} from './useBattleDialogue';
export { useBattleTaunts, type GenerateTauntsVars } from './useBattleTaunts';
export { usePetError, type PetError } from './usePetError';
export { useTxError, type TxError } from './useTxError';
