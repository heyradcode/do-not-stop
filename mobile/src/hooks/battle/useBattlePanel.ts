import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    describeMechanicalLogEntry,
    describeNoOpponents,
    getReadyPetsUnified,
    useBattlePets,
    useBattleTaunts,
    useChainCapabilities,
    useCreateBattleRoom,
    useLiveBattleAnimation,
    opponentKey,
    useOpponents,
    usePetList,
    useWinEstimate,
    toDialoguePet,
    type BattlePersonas,
    type BattlePetsArgs,
    type BattleResolvedResult,
    type DialogueTurn,
    type OpponentPet,
    type Pet,
} from '@shared/core';

import { BATTLE_ROOM_WS_URL } from '../../constants/api';
import { usePetErrorToast } from '../usePetErrorToast';
import { pickRandomOpponent, sortOpponentsByMatch } from './matchmaking';
import { useResultDialogue } from './useResultDialogue';

const BATTLE_FAIL_MESSAGE = 'Failed to start the battle. Please try again.';
const VALIDATION_MESSAGE = 'Pick one of your pets and an opponent first.';

export interface UseBattlePanel {
    isConnected: boolean;
    /** Own pets off cooldown; a pet on cooldown cannot legally battle. */
    readyPets: { id: string; pet: Pet }[];
    /** Whether the wallet holds any pets at all, before the cooldown filter. */
    hasAnyPets: boolean;
    selectedPetId: string;
    onSelectPet: (id: string) => void;
    fighter: Pet | null;
    /** Opponents sorted by how close their level is to the fighter's. */
    opponents: OpponentPet[];
    opponentsLoading: boolean;
    opponentsError: Error | null;
    /**
     * Why the list is empty, in words, or null when it is not.
     *
     * The server names which filter emptied it, because four very different situations
     * render as the same blank picker and only some are the player's to act on: nothing
     * indexed yet is ours, nobody having allowed challenges is another player's, and a
     * cooldown is nobody's. "No opponents available" tells the one person who could act
     * the one thing that does not help.
     */
    opponentsEmptyMessage: string | null;
    /**
     * The chosen opponent as `owner::id`, not a bare pet id.
     *
     * Pet ids are not unique across owners on Solana, so an id alone can name two
     * different pets. Frontend has always keyed on this; mobile keyed its list rows by the
     * same string while selecting on the id, which resolved to whichever matching pet came
     * first and then sent that pet's owner as `defenderOwner`.
     */
    selectedOpponentKey: string;
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
    /** Fighter and opponent HP as 0-100, stepping down one strike at a time. */
    hp1Percent: number;
    hp2Percent: number;
    /** Flavour line for the strike currently on screen; null before the first. */
    flourish: string | null;
    /** Every strike played so far, worded for the log, oldest first. */
    strikeLog: string[];
    /** True once the replay has finished, or immediately when there is nothing to play. */
    replayDone: boolean;
    /** Restart the same replay from its first strike. */
    onReplay: () => void;
    /** Whether a replay exists to watch at all. */
    hasReplay: boolean;
    /** What the two pets say to each other after the fight; taunts excluded. */
    resultTurns: DialogueTurn[];
    dialogueLoading: boolean;
    /** Both names, resolved through the personas captured at battle start. */
    attackerName: string;
    defenderName: string;
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
    const [selectedOpponentKey, setSelectedOpponentKey] = useState('');
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

    /**
     * Both personas as they stood when the fight started.
     *
     * Not a convenience. Publishing a receipt puts the fighter on cooldown, which drops
     * it out of `readyPets`, so `fighter` is null by the time a result is on screen and
     * `opponent` can leave the matchmaking list the same way. Everything that names the
     * two afterwards — the strike log, the result dialogue — reads through here instead,
     * or a finished battle narrates itself as "Your pet" against "The opponent".
     */
    const personasRef = useRef<BattlePersonas | null>(null);

    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const fighter = readyPets.find(({ id }) => id === selectedPetId)?.pet ?? null;

    const {
        opponents: rawOpponents,
        isLoading: opponentsLoading,
        error: opponentsError,
        emptyReason,
    } = useOpponents({ chain: capabilities.activeKind, enabled: capabilities.isConnected });

    const opponents = useMemo(
        () => sortOpponentsByMatch(rawOpponents, fighter?.level ?? null),
        [rawOpponents, fighter?.level],
    );
    const opponent =
        opponents.find((o) => opponentKey(o.owner, o.id) === selectedOpponentKey) ?? null;

    const { winProbability, isLoading: winEstimateLoading } = useWinEstimate(
        capabilities.activeKind,
        selectedPetId || null,
        // The estimate is per pet, so it takes the resolved pet's id rather than the key.
        opponent?.id ?? null,
    );

    const battle = useBattlePets({
        onSuccess: (resolved) => {
            setResult(resolved);
            refetch();
        },
        roomId,
        roomSocketUrl: BATTLE_ROOM_WS_URL,
    });

    /**
     * The fight, played back one strike at a time.
     *
     * `liveReplay` is this client's *own* simulation of the receipt's inputs, and
     * `useBattlePets` only exposes it once every verification check has passed. So the
     * animation cannot disagree with the result beside it: if the local replay produced a
     * different fight, `checkCombatReplay` would have failed and there would be nothing
     * here to animate. That is why this needs no reconciliation notice of the kind
     * frontend carried for the old on-chain path.
     *
     * It is presentation only either way. The receipt settles the battle; this shows how.
     */
    const animation = useLiveBattleAnimation(
        battle.liveReplay?.log ?? null,
        battle.liveReplay?.startHp1 ?? null,
        battle.liveReplay?.startHp2 ?? null,
        true,
    );

    const dialogue = useResultDialogue({
        chain: capabilities.activeKind,
        battleId: battle.hash ?? null,
        fighter,
        opponent,
        personas: personasRef.current,
        attackerWon: result?.firstWins ?? null,
        leveledUp: result?.attackerLeveledUp ?? false,
        enabled: result != null,
    });

    const strikeLog = useMemo(
        () =>
            animation.history.map((entry) =>
                describeMechanicalLogEntry(entry, dialogue.attackerName, dialogue.defenderName),
            ),
        [animation.history, dialogue.attackerName, dialogue.defenderName],
    );

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
        setSelectedOpponentKey('');
    }, [selectedPetId]);

    const onRandomOpponent = useCallback(() => {
        if (!fighter) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        const picked = pickRandomOpponent(opponents, fighter.level);
        if (picked) setSelectedOpponentKey(opponentKey(picked.owner, picked.id));
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
        const personas = {
            attacker: toDialoguePet(fighter),
            defender: toDialoguePet(opponent),
        };
        personasRef.current = personas;
        taunts.generate({ chain, ...personas });

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
        hasAnyPets: pets.length > 0,
        selectedPetId,
        onSelectPet: setSelectedPetId,
        fighter,
        opponents,
        opponentsLoading,
        opponentsError,
        opponentsEmptyMessage:
            rawOpponents.length === 0 && !opponentsLoading && !opponentsError
                ? describeNoOpponents(emptyReason ?? null)
                : null,
        selectedOpponentKey,
        onSelectOpponent: setSelectedOpponentKey,
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
        hp1Percent: animation.hp1Percent,
        hp2Percent: animation.hp2Percent,
        flourish: animation.flourish,
        strikeLog,
        replayDone: animation.done,
        onReplay: animation.replay,
        hasReplay: (battle.liveReplay?.log.length ?? 0) > 0,
        resultTurns: dialogue.resultTurns,
        dialogueLoading: dialogue.isLoading,
        attackerName: dialogue.attackerName,
        defenderName: dialogue.defenderName,
    };
};
