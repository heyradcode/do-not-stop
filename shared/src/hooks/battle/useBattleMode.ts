import { useBattleConfig } from './useBattleConfig';

/**
 * Which battle path this client should use (§L Phase 3).
 *
 * Phase 3 runs both modes side by side, so this is a question with a real answer rather
 * than a migration flag. The server decides — `GET /api/battle/config` reports whether it
 * is accepting backend battles — because the client cannot know, and finding out by
 * submitting an intent and getting a 503 would mean discovering it after the wallet prompt.
 *
 * Fails to `onchain`, deliberately and in every uncertain case: while the config is still
 * loading, if the request failed, and if the deployment says it is not accepting backend
 * battles. The on-chain path always works; guessing the other way would offer a player a
 * battle this deployment cannot actually run.
 */

export type BattleMode = 'backend' | 'onchain';

export interface BattleModeState {
    mode: BattleMode;
    /** True while the answer is still the fallback rather than the server's. */
    isLoading: boolean;
    /** True once the server has actually answered, whichever way. */
    isResolved: boolean;
}

export function useBattleMode(): BattleModeState {
    const { data, isLoading, isError } = useBattleConfig();

    const resolved = !isLoading && !isError && data !== undefined;
    return {
        mode: resolved && data.enabled ? 'backend' : 'onchain',
        isLoading,
        isResolved: resolved,
    };
}
