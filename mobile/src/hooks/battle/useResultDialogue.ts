import { useMemo } from 'react';
import {
    toDialoguePet,
    useBattleDialogue,
    type BattlePersonas,
    type DialogueTurn,
    type OpponentPet,
    type Pet,
    type PetChain,
} from '@shared/core';

export interface UseResultDialogueArgs {
    chain: PetChain | null;
    /** Stable per-battle key; null until a battle has an id. */
    battleId: string | null;
    fighter: Pet | null;
    opponent: OpponentPet | null;
    /** Personas captured at battle start, for once the fighter leaves the ready list. */
    personas: BattlePersonas | null;
    /** True when the attacker won; null until the receipt has resolved. */
    attackerWon: boolean | null;
    leveledUp: boolean;
    /** Only fetch while a result is on screen. */
    enabled: boolean;
}

export interface UseResultDialogue {
    /** The post-fight reactions, taunts excluded. */
    resultTurns: DialogueTurn[];
    isLoading: boolean;
    attackerName: string;
    defenderName: string;
}

/**
 * The settled battle's AI dialogue, shaped for the mobile result sheet.
 *
 * App-local rather than in `@shared/core`, matching frontend's own copy, and for the
 * same reason: what it does is map dialogue turns onto one client's view props, and the
 * two clients' props differ. The fetch underneath is shared (`useBattleDialogue`); only
 * the mapping is duplicated, which is the part that would drift if it were unified.
 *
 * Smaller than frontend's, deliberately. That one also gates the result actions until a
 * typewriter finishes playing the lines, and returns `markResultDialogueDone` /
 * `resetResultDialogue` to drive that gate. Mobile renders the lines at once, so there is
 * no playback to wait on and nothing to gate.
 *
 * **The personas fallback is not optional.** A pet that has just fought goes on cooldown
 * and drops out of `readyPets`, so `fighter` is null by the time a result is on screen.
 * Without the personas captured at battle start the query would be disabled exactly when
 * it is needed, and the pre-generated dialogue would never be fetched.
 */
export const useResultDialogue = ({
    chain,
    battleId,
    fighter,
    opponent,
    personas,
    attackerWon,
    leveledUp,
    enabled,
}: UseResultDialogueArgs): UseResultDialogue => {
    const attacker = useMemo(
        () => (fighter ? toDialoguePet(fighter) : (personas?.attacker ?? null)),
        [fighter, personas],
    );
    const defender = useMemo(
        () => (opponent ? toDialoguePet(opponent) : (personas?.defender ?? null)),
        [opponent, personas],
    );

    const { turns, isLoading } = useBattleDialogue({
        chain,
        battleId,
        attacker,
        defender,
        winner: attackerWon === null ? null : attackerWon ? 'attacker' : 'defender',
        leveledUp,
        enabled: enabled && attackerWon !== null,
    });

    // The taunts already played before the fight; only the reactions belong here.
    const resultTurns = useMemo(() => turns.filter((t) => t.phase === 'result'), [turns]);

    return {
        resultTurns,
        isLoading,
        attackerName: attacker?.name ?? 'Your pet',
        defenderName: defender?.name ?? 'Opponent',
    };
};
