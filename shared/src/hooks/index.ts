// Auth callback — consumed by app bootstrap code (e.g. frontend/src/config.ts).
export { setTokenSuccessCallback } from './chains/ethereum/useVerifySignature';
// Low-level EVM read hook — consumed by mobile until it migrates to usePetList.
export { usePetsContract } from './chains/ethereum/usePetsContract';
// v2 fee schedule readers — EVM reads GameConfig, Solana reads GlobalState PDA.
// useFees is the unified chain-neutral interface; useEvmFees/useSolanaFees are low-level.
export { useFees, type UnifiedFees } from './session/useFees';
export { useEvmFees, type EvmFees } from './chains/ethereum/useEvmFees';
export { useSolanaFees, type SolanaFees } from './chains/solana/useSolanaFees';
// Manual recovery for an interrupted async breed (settle / cancel a pending request).
export { usePendingBreed, type PendingBreed } from './chains/ethereum/usePendingBreed';
export { useBreedRelationCheck, type BreedRelationCheck } from './chains/ethereum/useBreedRelationCheck';
// Solana pending VRF requests — auto-resumes on next action; cancel available after randomness expiry.
export { usePendingSolanaBreed, type PendingSolanaBreed } from './chains/solana/usePendingSolanaBreed';
// Solana NFT metadata sync — re-publishes on-chain state to Metaplex Core attributes. No-op on EVM.
export { useSyncMetadata, type UseSyncMetadataResult } from './pets/useSyncMetadata';
// Solana stud fee earnings: balance query + withdraw_stud_fees action.
export { useStudFees, type UseStudFeesResult } from './marriage/useStudFees';
// v2.1 marriage: write actions + per-pet marriage state (EVM + Solana).
export { useMarriage, type MarriageAction } from './marriage/useMarriage';
export { useMarriageInfo, type MarriageInfo } from './marriage/useMarriageInfo';

export { useActiveChain, type ActiveChain } from './session/useActiveChain';
export { useChainCapabilities, type ChainContext } from './session/useChainCapabilities';
export type { TxLifecycle, TxPhase, ChainCapabilities } from './adapters/types';
export { usePetList, type PetListResult } from './pets/usePetList';
// Backend battle progression. usePetList already applies it to a player's own pets;
// exported for anything reading pets from the chain by another route.
export { useBattleProgress, mergeBattleProgress } from './battle/useBattleProgress';
export {
    useCreatePet,
    type CreatePetArgs,
    type PetMutationOptions,
    type PetMutationResult,
} from './pets/useCreatePet';
export { useLevelUpPet, type LevelUpPetArgs } from './pets/useLevelUpPet';
export { useTrainPet, type TrainPetArgs } from './pets/useTrainPet';
export { useRenamePet, type RenamePetArgs } from './pets/useRenamePet';
export {
    useBattlePets,
    type BattlePetsArgs,
    type UseBattlePetsOptions,
} from './battle/useBattlePets';
export {
    useBreedPets,
    type BreedPetsArgs,
    type UseBreedPetsOptions,
} from './pets/useBreedPets';
export { useTransferPet, type TransferPetArgs } from './pets/useTransferPet';
export { useOpponents, type UseOpponentsOptions } from './battle/useOpponents';
export { useSearchPets, type UseSearchPetsOptions, type SearchPetsResult } from './pets/useSearchPets';
export { useAllPets, type UseAllPetsOptions } from './pets/useAllPets';
export {
    useSpousePet,
    type UseSpousePetOptions,
    type SpousePetResult,
} from './pets/useSpousePet';
export { useIncomingProposals, type IncomingProposal } from './marriage/useIncomingProposals';
export { useWinEstimate, type WinEstimateResult } from './battle/useWinEstimate';
// Leaderboards. Ranked server-side over the merged battle record, so a page arrives
// already ordered and `rank` is absolute rather than per-page.
export {
    useLeaderboard,
    type LeaderboardEntry,
    type UseLeaderboardOptions,
    type UseLeaderboardResult,
} from './leaderboard/useLeaderboard';
export {
    usePlayerLeaderboard,
    type PlayerLeaderboardEntry,
    type UsePlayerLeaderboardOptions,
    type UsePlayerLeaderboardResult,
} from './leaderboard/usePlayerLeaderboard';
export {
    useBattleDialogue,
    type UseBattleDialogueOptions,
    type DialogueTurn,
    type DialoguePetInput,
    type DialogueSpeaker,
    type DialoguePhase,
} from './battle/useBattleDialogue';
export { useBattleTaunts, type GenerateTauntsVars } from './battle/useBattleTaunts';
export { useCreateBattleRoom, type CreateRoomVars } from './battle/useCreateBattleRoom';
// Backend-authoritative battles (docs/battle-protocol.md §D, §E, §J).
export { BATTLE_CONFIG_QUERY_KEY, useBattleConfig, type BattleConfig } from './battle/useBattleConfig';
export { useBattleMode, type BattleMode, type BattleModeState } from './battle/useBattleMode';
export {
    useSubmitBattleIntent,
    type AcceptedBattle,
    type SubmitBattleIntentVars,
} from './battle/useSubmitBattleIntent';
export {
    useDefenseAuthorization,
    type GrantDefenseVars,
} from './battle/useDefenseAuthorization';
export {
    battleStateQueryKey,
    useBackendBattle,
    useStoredBattleEvidence,
    type BattleStateSummary,
    type UseBackendBattleOptions,
} from './battle/useBackendBattle';
export {
    useBattleRoomSocket,
    type BattleRoomNotification,
    type UseBattleRoomSocketOptions,
} from './battle/useBattleRoomSocket';
export {
    useVerifiedBattleReceipt,
    verifiedReceiptQueryKey,
    type VerifiedBattleReceipt,
} from './battle/useVerifiedBattleReceipt';
export { usePetError, type PetError } from './tx/usePetError';
export { useTxError, type TxError } from './tx/useTxError';
