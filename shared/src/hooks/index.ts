// Auth callback — consumed by app bootstrap code (e.g. frontend/src/config.ts).
export { setTokenSuccessCallback } from './chains/ethereum/useVerifySignature';
// Low-level EVM read hook — consumed by mobile until it migrates to usePetList.
export { usePetsContract } from './chains/ethereum/usePetsContract';
// v2 fee schedule readers — EVM reads GameConfig, Solana reads GlobalState PDA.
// useFees is the unified chain-neutral interface; useEvmFees/useSolanaFees are low-level.
export { useFees, type UnifiedFees } from './useFees';
export { useEvmFees, type EvmFees } from './chains/ethereum/useEvmFees';
export { useSolanaFees, type SolanaFees } from './chains/solana/useSolanaFees';
// Manual recovery for an interrupted async battle (settle / cancel a pending request).
export { usePendingBattle, type PendingBattle } from './chains/ethereum/usePendingBattle';
export { usePendingBreed, type PendingBreed } from './chains/ethereum/usePendingBreed';
// Solana pending VRF requests — auto-resumes on next action; cancel available after randomness expiry.
export { usePendingSolanaBattle, type PendingSolanaBattle } from './chains/solana/usePendingSolanaBattle';
export { usePendingSolanaBreed, type PendingSolanaBreed } from './chains/solana/usePendingSolanaBreed';
// Solana defender-consent toggle (openToChallenges). No-op on EVM.
export { useSetOpenToChallenges, type UseSetOpenToChallengesResult } from './useSetOpenToChallenges';
// Solana NFT metadata sync — re-publishes on-chain state to Metaplex Core attributes. No-op on EVM.
export { useSyncMetadata, type UseSyncMetadataResult } from './useSyncMetadata';
// Solana stud fee earnings: balance query + withdraw_stud_fees action.
export { useStudFees, type UseStudFeesResult } from './useStudFees';
// v2.1 marriage: write actions + per-pet marriage state (EVM + Solana).
export { useMarriage, type MarriageAction } from './useMarriage';
export { useMarriageInfo, type MarriageInfo } from './useMarriageInfo';

export { useActiveChain, type ActiveChain } from './useActiveChain';
export { useChainCapabilities, type ChainContext } from './useChainCapabilities';
export type { TxLifecycle, TxPhase, ChainCapabilities } from './adapters/types';
export { usePetList, type PetListResult } from './usePetList';
export {
    useCreatePet,
    type CreatePetArgs,
    type PetMutationOptions,
    type PetMutationResult,
} from './useCreatePet';
export { useLevelUpPet, type LevelUpPetArgs } from './useLevelUpPet';
export { useTrainPet, type TrainPetArgs } from './useTrainPet';
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
export { useSearchPets, type UseSearchPetsOptions, type SearchPetsResult } from './useSearchPets';
export { useAllPets, type UseAllPetsOptions } from './useAllPets';
export { useIncomingProposals, type IncomingProposal } from './useIncomingProposals';
export { useWinEstimate, type WinEstimateResult } from './useWinEstimate';
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
