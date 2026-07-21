import type { SimOutcomeWire } from '../utils/combat';
import type { BattleResolvedResult } from './battle';

/** JSON-safe encoding of `BattleResolvedResult` — `bigint` fields as decimal strings. */
export interface BattleResolvedResultWire {
    requestId: string;
    winnerId: string;
    loserId: string;
    vrfSeed: string;
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
}

/**
 * Backend settle-keeper -> frontend push, over the live-battle-socket WebSocket
 * (backend/src/ws/liveBattleSocket.ts). Two message shapes share one channel:
 *   'live'     - the computed sim, pushed the instant entropy reveals (presentation only).
 *   'resolved' - the actual settled outcome, pushed once the keeper's settle tx confirms
 *                (authoritative — mirrors the on-chain BattleResolved event, since the
 *                keeper decodes it from its own settle receipt).
 */
export type LiveBattleWireMessage =
    | { type: 'live'; chainId: number; requestId: string; outcome: SimOutcomeWire }
    | { type: 'resolved'; chainId: number; requestId: string; result: BattleResolvedResultWire };

export const encodeBattleResolvedResult = (r: BattleResolvedResult): BattleResolvedResultWire => ({
    requestId: r.requestId.toString(),
    winnerId: r.winnerId.toString(),
    loserId: r.loserId.toString(),
    vrfSeed: r.vrfSeed.toString(),
    firstWins: r.firstWins,
    rounds: r.rounds,
    winnerHpRemaining: r.winnerHpRemaining,
    xpWin: r.xpWin,
    xpLoss: r.xpLoss,
});

export const decodeBattleResolvedResult = (w: BattleResolvedResultWire): BattleResolvedResult => ({
    requestId: BigInt(w.requestId),
    winnerId: BigInt(w.winnerId),
    loserId: BigInt(w.loserId),
    vrfSeed: BigInt(w.vrfSeed),
    firstWins: w.firstWins,
    rounds: w.rounds,
    winnerHpRemaining: w.winnerHpRemaining,
    xpWin: w.xpWin,
    xpLoss: w.xpLoss,
});
