/**
 * Decoded `BattleResolved` event from GameLogic (EVM). Carries everything the
 * fight-replay UI needs: the VRF seed (to re-run the deterministic combat sim)
 * plus the resolved outcome and XP deltas.
 */
export interface BattleResolvedResult {
    requestId: bigint;
    winnerId: bigint;
    loserId: bigint;
    vrfSeed: bigint;
    /** True when petId1 (the requester's attacker) won. */
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
}

/**
 * Stage of the async EVM battle flow: request → VRF fulfill → settle → resolved.
 *
 * `awaiting-settle` is the normal post-reveal state: the backend settle keeper
 * (plan-realtime-battle-impl.md Phase 2) is expected to submit `settleBattle`
 * without the player's wallet. `settling` only appears if that keeper hasn't
 * settled within the fallback timeout and the frontend sends it itself.
 */
export type EvmBattlePhase =
    | 'idle'
    | 'requesting'
    | 'awaiting-vrf'
    | 'awaiting-settle'
    | 'settling'
    | 'resolving'
    | 'resolved'
    | 'error';
