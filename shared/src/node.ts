/**
 * Node-safe surface for the backend settle-keepers / live-battle socket.
 *
 * Deliberately does NOT re-export the main barrel (`./index.ts`): that pulls in
 * React hooks/contexts (.tsx) which the backend typechecks without JSX and
 * which Node has no business loading at runtime.
 */

export {
    encodeBattleResolvedResult,
    decodeBattleResolvedResult,
    type BattleResolvedResultWire,
    type LiveBattleWireMessage,
} from './types/liveBattleSocket';
export type { BattleResolvedResult, EvmBattlePhase } from './types/battle';
export {
    simulate,
    encodeSimOutcome,
    decodeSimOutcome,
    type SimOutcome,
    type SimOutcomeWire,
    type StrikeLogEntry,
} from './utils/combat';
export {
    fetchAssetByPetId,
    getAccountClient,
    globalStatePda,
    petPdaByAsset,
    sendSignedTx,
    toU32,
    type AnchorAccountClient,
} from './utils/solana';
