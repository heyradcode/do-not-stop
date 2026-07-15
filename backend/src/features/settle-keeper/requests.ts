import type { SettleFunctionName } from './abi';

export type TrackedRequestType = 'battle' | 'breed' | 'mint';

const REQUEST_EVENT_TYPE: Record<string, TrackedRequestType> = {
    BattleRandomnessRequested: 'battle',
    BreedRandomnessRequested: 'breed',
    MintRequested: 'mint',
};

const SETTLE_FUNCTION: Record<TrackedRequestType, SettleFunctionName> = {
    battle: 'settleBattle',
    breed: 'settleBreed',
    mint: 'settleMint',
};

const SETTLED_EVENTS = new Set(['BattleResolved', 'BreedSettled', 'MintSettled']);

/**
 * Minimal shape shared by viem's decoded `getContractEvents`/`watchContractEvent` logs.
 * `args` is untyped here deliberately: viem's real decoded type is a discriminated union
 * across every event in GAME_LOGIC_ABI (each with a different arg shape), which is exactly
 * the kind of viem-specific generic surface this module shouldn't need to know about to stay
 * a plain, easily-unit-tested pure function.
 */
export interface DecodedGameLogicLog {
    eventName: string;
    args: Record<string, unknown>;
    /** Optional so hand-built test fixtures don't need it; real getContractEvents logs
     *  always carry it. Used by keeper.ts to flag requests nearing the backfill cutoff. */
    blockNumber?: bigint;
}

/** GameLogic._requestTypes is deleted from storage the moment entropy reveals
 *  (GameLogic.sol `_fulfill`), so request type can only be recovered from the
 *  original request event — never from a post-reveal chain read. */
export function requestTypeForEvent(eventName: string): TrackedRequestType | undefined {
    return REQUEST_EVENT_TYPE[eventName];
}

export function settleFunctionFor(type: TrackedRequestType): SettleFunctionName {
    return SETTLE_FUNCTION[type];
}

export function isSettledEvent(eventName: string): boolean {
    return SETTLED_EVENTS.has(eventName);
}

/**
 * Builds the still-pending requestId -> type map from a window of historical
 * logs: every tracked request minus every settlement seen in the same
 * window. Used for keeper startup backfill, so a keeper restart after
 * downtime self-heals instead of losing track of anything left pending.
 *
 * Note this can't distinguish a settled request from a *cancelled* one —
 * cancelBattle/cancelBreed/cancelMint emit no event. That's fine: the
 * settle-simulation step (see submitter.ts) is the authoritative pending
 * check, and simulating a cancelled request simply fails harmlessly.
 */
export function buildPendingMap(
    requestLogs: DecodedGameLogicLog[],
    settledLogs: DecodedGameLogicLog[],
): Map<bigint, TrackedRequestType> {
    const pending = new Map<bigint, TrackedRequestType>();
    for (const log of requestLogs) {
        const type = requestTypeForEvent(log.eventName);
        const requestId = log.args.requestId as bigint | undefined;
        if (type && requestId != null) pending.set(requestId, type);
    }
    for (const log of settledLogs) {
        const requestId = log.args.requestId as bigint | undefined;
        if (requestId != null) pending.delete(requestId);
    }
    return pending;
}
