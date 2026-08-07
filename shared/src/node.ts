/**
 * Node-safe surface for the backend settle keeper.
 *
 * Deliberately does NOT re-export the main barrel (`./index.ts`): that pulls in
 * React hooks/contexts (.tsx) which the backend typechecks without JSX and
 * which Node has no business loading at runtime.
 */

export type { BattleResolvedResult } from './types/battle';
// The chat reaction whitelist: the backend validates against the same list the client
// offers, so a picker can never show an emoji the API refuses.
export { CHAT_REACTIONS, isChatReaction, type ChatReaction } from './hooks/chat/reactions';
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
