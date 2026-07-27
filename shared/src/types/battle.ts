/**
 * A resolved battle, as the UI renders it.
 *
 * Previously the decoded `BattleResolved` event from GameLogic; battles are now resolved by
 * the backend (§L Phase 6), so this is built from a *verified* signed receipt instead. The
 * field names are kept so the existing UI is unchanged, but two now mean something slightly
 * different: `requestId` is always 0 (there is no on-chain request behind a backend battle)
 * and `vrfSeed` is the drand-derived battle seed rather than a Pyth Entropy word. Both still
 * re-run the deterministic combat sim identically.
 */
export interface BattleResolvedResult {
    /** Always 0 for a backend battle: there is no on-chain request to reference. */
    requestId: bigint;
    winnerId: bigint;
    loserId: bigint;
    /** The battle seed, derived from the committed drand round (§E). */
    vrfSeed: bigint;
    /** True when petId1 (the requester's attacker) won. */
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
    /**
     * Whether the attacker's pet levelled up.
     *
     * Carried on the result because on-chain pet stats no longer move when a battle
     * resolves — backend progression lives in `pet_battle_progress` — so the old approach of
     * diffing refreshed chain stats can never detect it.
     */
    attackerLeveledUp: boolean;
}

