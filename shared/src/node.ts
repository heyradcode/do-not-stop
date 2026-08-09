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
// The item vocabulary (roadmap §4): the backend validates its catalog against the same
// types a client renders, so an added effect kind cannot land on one side only.
export {
    describeItemEffect,
    explainItem,
    itemStats,
    ITEM_CATEGORIES,
    parseItemEffect,
    SLOT,
    SLOT_NAMES,
    type EquippedItem,
    type InventoryEntry,
    type ItemCategory,
    type ItemDefinition,
    type ItemEffect,
    type ItemStat,
    type SlotName,
    type StatBonus,
} from './types/item';
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
