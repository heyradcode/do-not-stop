import type { EvmBattlePhase } from '@shared/core';
import { formatTxHashHint } from '@hooks/usePetError';

export interface BattleViewArgs {
    usesSwitchboardVrf: boolean;
    battleHash: string | undefined;
    settledBattleId: string | null;
    isBattling: boolean;
    rematchPending: boolean;
    battlePhase: EvmBattlePhase | undefined;
    battleIsConfirming: boolean;
    battleIsPending: boolean;
    tauntsLoading: boolean;
    hasPendingBattle: boolean;
    overlayOpen: boolean;
    selectedPet1: string;
    selectedOpponent: string;
    showResult: boolean;
    canRandomMatch: boolean;
}

export interface BattleView {
    subtitle: string;
    hashHint: string | null;
    preResultTitle: string;
    preResultStatus: string | null;
    battleButtonLabel: string;
    battleDisabled: boolean;
    randomMatchDisabled: boolean;
}

/**
 * Pure label/status/flag derivations for the battle setup + overlay views —
 * "what does the UI say right now", with no state and no side effects.
 * Extracted from `useBattlePanel` to separate this from the stateful
 * selection/validation/rematch orchestration that hook deliberately keeps
 * together (see its own docstring for why that part isn't split further).
 */
export const deriveBattleView = ({
    usesSwitchboardVrf,
    battleHash,
    settledBattleId,
    isBattling,
    rematchPending,
    battlePhase,
    battleIsConfirming,
    battleIsPending,
    tauntsLoading,
    hasPendingBattle,
    overlayOpen,
    selectedPet1,
    selectedOpponent,
    showResult,
    canRandomMatch,
}: BattleViewArgs): BattleView => {
    const subtitle = usesSwitchboardVrf
        ? 'Pick your fighter and an opponent (Switchboard VRF)'
        : 'Pick your fighter and an opponent';
    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Starting Battle...';
    // Fall back to the retained battle id: the lifecycle auto-resets (hash
    // cleared) once the battle settles, but the hint should keep showing.
    const hashHint = usesSwitchboardVrf
        ? formatTxHashHint(battleHash ?? settledBattleId ?? undefined)
        : null;

    const preResultTitle = isBattling ? 'The battle is underway…' : 'Face-off!';
    // EVM v2 battle is async: request → VRF → settle. Label each phase so the
    // long VRF wait doesn't keep showing "Awaiting your wallet".
    const preResultStatus = rematchPending
        ? 'Preparing rematch…'
        : battlePhase === 'awaiting-vrf'
        ? 'Awaiting randomness…'
        : battlePhase === 'settling'
        ? 'Settling the battle…'
        : battlePhase === 'resolving'
        ? 'Resolving the outcome…'
        : battleIsConfirming
        ? 'Confirming on-chain…'
        : battleIsPending
        ? 'Awaiting your wallet…'
        : null;

    const battleButtonLabel = tauntsLoading
        ? 'Facing off…'
        : battleIsPending
        ? pendingLabel
        : battleIsConfirming
        ? 'Confirming...'
        : 'Start Battle';
    const battleDisabled =
        battleIsPending ||
        battleIsConfirming ||
        rematchPending ||
        overlayOpen ||
        !selectedPet1 ||
        !selectedOpponent ||
        showResult ||
        hasPendingBattle;
    const randomMatchDisabled = !canRandomMatch || battleIsPending || showResult;

    return {
        subtitle,
        hashHint,
        preResultTitle,
        preResultStatus,
        battleButtonLabel,
        battleDisabled,
        randomMatchDisabled,
    };
};
