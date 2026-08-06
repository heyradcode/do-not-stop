import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getReadyPetsUnified,
    useBattlePets,
    useBattleTaunts,
    useChainCapabilities,
    useCreateBattleRoom,
    useOpponents,
    usePetList,
    useWinEstimate,
    type BattleResolvedResult,
    type DialoguePetInput,
    type OpponentPet,
    type Pet,
} from '@shared/core';

import { usePetErrorToast } from '../usePetErrorToast';
import { pickRandomOpponent, sortOpponentsByMatch } from './matchmaking';

const BATTLE_FAIL_MESSAGE = 'Failed to start the battle. Please try again.';
const VALIDATION_MESSAGE = 'Pick one of your pets and an opponent first.';

/** Ported from frontend's `battle-utils`; the backend builds a persona from this. */
const toDialoguePet = (pet: Pet | OpponentPet): DialoguePetInput => ({
    petId: pet.id,
    name: pet.name,
    level: pet.level,
    rarity: pet.rarity,
    dna: pet.dna.toString(),
    winCount: pet.winCount,
    lossCount: pet.lossCount,
});

export interface UseBattlePanel {
    isConnected: boolean;
    /** Own pets off cooldown; a pet on cooldown cannot legally battle. */
    readyPets: { id: string; pet: Pet }[];
    selectedPetId: string;
    onSelectPet: (id: string) => void;
    fighter: Pet | null;
    /** Opponents sorted by how close their level is to the fighter's. */
    opponents: OpponentPet[];
    opponentsLoading: boolean;
    opponentsError: Error | null;
    selectedOpponentId: string;
    onSelectOpponent: (id: string) => void;
    opponent: OpponentPet | null;
    onRandomOpponent: () => void;
    winProbability: number | null;
    winEstimateLoading: boolean;
    taunts: string[];
    phase: string;
    isBusy: boolean;
    validationError: string | null;
    onStartBattle: () => void;
    result: BattleResolvedResult | null;
    onDismissResult: () => void;
}

/**
 * Headless controller for the battle screen, following
 * `frontend/src/hooks/battle/useBattlePanel.ts`.
 *
 * **Narrower than frontend's on purpose.** That one also drives a live WebSocket
 * replay, a per-round animation, and a mismatch-reconciliation notice for when the
 * client replay disagrees with the signed receipt. None of those are in this
 * screen's hook list in `docs/plan-mobile-frontend-parity.md`, and the receipt is
 * what settles a battle either way, so mobile shows the taunts, then the result the
 * receipt carries. `useBattleRoomSocket` is deliberately not wired.
 *
 * A room is still minted before the battle (§J) so a spectator or a later replay
 * has something to attach to.
 */
export const useBattlePanel = (initialPetId?: string): UseBattlePanel => {
    const capabilities = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const taunts = useBattleTaunts();
    const createRoom = useCreateBattleRoom();

    const [selectedPetId, setSelectedPetId] = useState(initialPetId ?? '');
    const [selectedOpponentId, setSelectedOpponentId] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [result, setResult] = useState<BattleResolvedResult | null>(null);

    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const fighter = readyPets.find(({ id }) => id === selectedPetId)?.pet ?? null;

    const {
        opponents: rawOpponents,
        isLoading: opponentsLoading,
        error: opponentsError,
    } = useOpponents({ chain: capabilities.activeKind, enabled: capabilities.isConnected });

    const opponents = useMemo(
        () => sortOpponentsByMatch(rawOpponents, fighter?.level ?? null),
        [rawOpponents, fighter?.level],
    );
    const opponent = opponents.find((o) => o.id === selectedOpponentId) ?? null;

    const { winProbability, isLoading: winEstimateLoading } = useWinEstimate(
        capabilities.activeKind,
        selectedPetId || null,
        selectedOpponentId || null,
    );

    const battle = useBattlePets({
        onSuccess: (resolved) => {
            setResult(resolved);
            refetch();
        },
    });

    usePetErrorToast(battle.error, null, validationError, BATTLE_FAIL_MESSAGE);

    // Clear a stale opponent when the fighter changes: the previous pick was
    // chosen against a different level band and may no longer be a legal match.
    useEffect(() => {
        setSelectedOpponentId('');
    }, [selectedPetId]);

    const onRandomOpponent = useCallback(() => {
        if (!fighter) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        const picked = pickRandomOpponent(opponents, fighter.level);
        if (picked) setSelectedOpponentId(picked.id);
    }, [fighter, opponents]);

    const onStartBattle = useCallback(() => {
        setValidationError(null);
        setResult(null);

        if (!fighter || !opponent) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        if (!capabilities.activeKind) return;

        const chain = capabilities.activeKind;

        // Taunts first, then the room, then the battle. The taunts call also
        // pre-generates the result dialogue on the backend, keyed by matchup.
        taunts.generate({
            chain,
            attacker: toDialoguePet(fighter),
            defender: toDialoguePet(opponent),
        });

        // The room is best-effort (§J): it gives a spectator or a later replay
        // something to attach to, but a battle still settles from its receipt, so a
        // failed mint must not block the fight.
        Promise.resolve(
            createRoom.createRoom({
                chain,
                attackerPetId: fighter.id,
                defenderPetId: opponent.id,
            }),
        )
            .catch(() => null)
            .then(() =>
                battle.mutate({
                    petId1: fighter.id,
                    petId2: opponent.id,
                    defenderOwner: opponent.owner,
                }),
            );
    }, [fighter, opponent, capabilities.activeKind, taunts, createRoom, battle]);

    return {
        isConnected: capabilities.isConnected,
        readyPets,
        selectedPetId,
        onSelectPet: setSelectedPetId,
        fighter,
        opponents,
        opponentsLoading,
        opponentsError,
        selectedOpponentId,
        onSelectOpponent: setSelectedOpponentId,
        opponent,
        onRandomOpponent,
        winProbability,
        winEstimateLoading,
        taunts: taunts.turns?.map((t) => t.text) ?? [],
        phase: battle.phase,
        isBusy: battle.isPending || createRoom.isLoading,
        validationError,
        onStartBattle,
        result,
        onDismissResult: () => setResult(null),
    };
};
