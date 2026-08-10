export const VALIDATION_MESSAGE = 'Please select your pet and an opponent';
export const BATTLE_FAIL_MESSAGE = 'Failed to start battle. Please try again.';
/** Shown briefly when the client-side live-replay disagrees with the on-chain
 *  BattleResolved result (the on-chain result always wins; this is
 *  presentational, not a real error). */
export const MISMATCH_NOTICE_MESSAGE = 'The on-chain referee ruled differently — syncing the true result…';

/** win/loss/levelUp snapshot taken just before calling battle.mutate. */
export type PreBattleStats = { winCount: number; lossCount: number; level: number };
