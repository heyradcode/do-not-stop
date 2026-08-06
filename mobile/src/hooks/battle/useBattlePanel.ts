import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getReadyPetsUnified,
    useBattlePets,
    useBattleTaunts,
    useChainCapabilities,
    useCreateBattleRoom,
    useOpponents,
    usePetList,
    useWinEstimate,
    type BattlePetsArgs,
    type BattleResolvedResult,
    type DialoguePetInput,
    type OpponentPet,
    type Pet,
} from '@shared/core';

import { BATTLE_ROOM_WS_URL } from '../../constants/api';
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
 * **Narrower than frontend's on purpose.** That one also drives a per-round
 * animation and a mismatch-reconciliation notice for when the client replay
 * disagrees with the signed receipt. Neither is in this screen's hook list in
 * `docs/plan-mobile-frontend-parity.md`, and the receipt is what settles a battle
 * either way, so mobile shows the taunts, then the result the receipt carries.
 *
 * Battle state itself is not narrower: `useBattlePets` polls
 * `GET /api/battle/:battleId` through `useBackendBattle`, which is the
 * authoritative source, and subscribes to the room socket for push updates on top
 * of it. The socket only ever says "ask again", so a client that cannot reach it
 * converges on the same state a little slower (§J).
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

    /**
     * The room this battle is watched through (§J), and the fight waiting on it.
     *
     * `useBattlePets` folds `roomId` into the `accept` call, and `accept` is what
     * records the room on the ledger row: it is the only thing that makes the
     * backend notify that room as the battle changes state. Minting a room and not
     * passing it here leaves it attached to nothing and every spectator holding
     * the link silently uninformed.
     *
     * The battle cannot start in the same tick the room is minted, because
     * `mutate` closes over `roomId` as it stood when the hook last ran. So the
     * mint stores the room and the pending fight together, and an effect starts
     * the battle on the next render, once `mutate` carries the new room.
     */
    const [roomId, setRoomId] = useState<string | null>(null);
    const [pendingStart, setPendingStart] = useState<BattlePetsArgs | null>(null);

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
        roomId,
        roomSocketUrl: BATTLE_ROOM_WS_URL,
    });

    // Read through a ref so the effect below depends on the pending fight alone.
    // `battle` is a fresh object every render, and depending on it would restart
    // the battle on each one.
    const battleRef = useRef(battle);
    battleRef.current = battle;

    useEffect(() => {
        if (!pendingStart) return;
        setPendingStart(null);
        battleRef.current.mutate(pendingStart);
    }, [pendingStart]);

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
            .then((mintedRoomId) => {
                // Recorded either way. Keeping the previous battle's room on a failed
                // mint would push this fight's updates to a room full of the wrong
                // spectators, which is worse than having no room at all.
                setRoomId(mintedRoomId ?? null);
                setPendingStart({
                    petId1: fighter.id,
                    petId2: opponent.id,
                    defenderOwner: opponent.owner,
                });
            });
    }, [fighter, opponent, capabilities.activeKind, taunts, createRoom]);

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
