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

/** Stage of the async EVM battle flow: request → VRF fulfill → settle → resolved. */
export type EvmBattlePhase =
    | 'idle'
    | 'requesting'
    | 'awaiting-vrf'
    | 'settling'
    | 'resolving'
    | 'resolved'
    | 'error';
