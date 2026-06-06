import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getReadyPetsUnified,
    useActiveChain,
    useBattlePets,
    useBattleTaunts,
    useOpponents,
    usePetList,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import { pickRandomOpponent, sortOpponentsByMatch } from '../battle-matchmaking';
import { useBattleOutcome } from './useBattleOutcome';
import { useResultDialogue } from './useResultDialogue';
import {
    BATTLE_FAIL_MESSAGE,
    REMATCH_COOLDOWN_MESSAGE,
    REMATCH_OPPONENT_GONE_MESSAGE,
    VALIDATION_MESSAGE,
    opponentKey,
    toDialoguePet,
    type BattlePersonas,
} from '../battle-utils';
import type { BattleOverlayProps } from '../parts/battle-overlay';
import type { BattleSetupProps } from '../parts/battle-setup';

interface UseBattlePanelArgs {
    isStandaloneView: boolean;
}

export interface UseBattlePanel {
    overlay: BattleOverlayProps;
    setup: BattleSetupProps;
    hashHint: string | null;
    receipt: {
        show: boolean;
        hash: string | undefined;
        onComplete: () => void;
        onError: (error: Error) => void;
    };
}

/**
 * Headless controller for the battle panel. Owns all state, refs, queries,
 * handlers, and effects, and returns a view-model wired to the presentational
 * components. The panel component is then a pure view over this hook.
 *
 * Selection, validation, and rematch are deliberately kept together here rather
 * than split into more hooks: they're tightly coupled (rematch drives the
 * selection; both random-match and battle-start touch validation), so a single
 * controller is the honest seam. The two genuinely isolated concerns — outcome
 * detection and dialogue — live in their own hooks (`useBattleOutcome`,
 * `useResultDialogue`) and are composed below.
 */
export function useBattlePanel({ isStandaloneView }: UseBattlePanelArgs): UseBattlePanel {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch, isLoading: petsLoading } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedOpponent, setSelectedOpponent] = useState('');
    const [showResult, setShowResult] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [opponentSlotFlash, setOpponentSlotFlash] = useState(false);
    const [rematchPending, setRematchPending] = useState(false);
    // The battle overlay stays open continuously: taunts → battling → result.
    const [overlayOpen, setOverlayOpen] = useState(false);
    // The battle's tx hash, retained in our own state. EVM clears battle.hash
    // (resetWrite) on receipt completion, so we capture it during confirming to
    // keep a stable battleId for the result dialogue after the battle settles.
    const [settledBattleId, setSettledBattleId] = useState<string | null>(null);

    const selectedOpponentCardRef = useRef<HTMLButtonElement>(null);
    const rematchSnapshotRef = useRef<{ petId1: string; opponentKey: string } | null>(null);
    // Personas captured at battle start. The backend pre-generates the result
    // dialogue when the taunts are requested (keyed by matchup), so nothing
    // hash-triggered is needed here — these are reused for the settle read.
    const battlePersonasRef = useRef<BattlePersonas | null>(null);

    const activeChainKind = chain.kind === 'none' ? null : chain.kind;
    const {
        opponents,
        isLoading: opponentsLoading,
        isFetching: opponentsFetching,
        refetch: refetchOpponents,
    } = useOpponents({ chain: activeChainKind });

    // Outcome detection (snapshot diff against refreshed on-chain stats).
    const outcome = useBattleOutcome({ pets, selectedPet1, petsLoading });

    const handleSuccess = useCallback(() => {
        setShowResult(true);
        setValidationError(null);
        outcome.markPendingOutcome();
        void refetch();
        void refetchOpponents();
    }, [outcome, refetch, refetchOpponents]);

    const battle = useBattlePets({ onSuccess: handleSuccess });
    // AI pre-fight taunts — generated on Start Battle, in parallel with the wallet.
    // Requesting taunts also kicks off result pregen on the backend.
    const taunts = useBattleTaunts();

    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const selectedFighter = useMemo(
        () => readyPets.find(({ id }) => id === selectedPet1)?.pet ?? null,
        [readyPets, selectedPet1],
    );
    const opponent = useMemo(
        () => opponents.find((o) => opponentKey(o.owner, o.id) === selectedOpponent),
        [opponents, selectedOpponent],
    );
    const fighterLevel = selectedFighter?.level ?? null;
    const sortedOpponents = useMemo(
        () => sortOpponentsByMatch(opponents, fighterLevel),
        [opponents, fighterLevel],
    );
    const isArenaReady = Boolean(selectedFighter && opponent && !battle.isPending && !showResult);
    const isArenaFighting = battle.isPending;

    // Settled-battle dialogue read + result-action gating.
    const dialogue = useResultDialogue({
        activeChainKind,
        settledBattleId,
        selectedFighter,
        opponent,
        personasRef: battlePersonasRef,
        battleOutcome: outcome.battleOutcome,
        showResult,
    });

    usePetErrorToast(battle.error, battle.receiptError, validationError, BATTLE_FAIL_MESSAGE);

    const usesSwitchboardVrf = chain.kind === 'solana';
    const canRandomMatch = Boolean(selectedFighter) && opponents.length > 0 && !opponentsLoading;
    const subtitle = usesSwitchboardVrf
        ? 'Pick your fighter and an opponent (Switchboard VRF)'
        : 'Pick your fighter and an opponent';
    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Starting Battle...';
    const hashHint = chain.kind === 'solana' ? formatTxHashHint(battle.hash) : null;

    const startBattle = useCallback(() => {
        if (!selectedPet1 || !opponent) {
            setValidationError(VALIDATION_MESSAGE);
            return false;
        }

        if (selectedFighter) outcome.snapshotFighterStats(selectedFighter);

        rematchSnapshotRef.current = {
            petId1: selectedPet1,
            opponentKey: opponentKey(opponent.owner, opponent.id),
        };
        setValidationError(null);
        void battle.mutate({
            petId1: selectedPet1,
            petId2: opponent.id,
            defenderOwner: opponent.owner,
        });
        return true;
    }, [battle, opponent, selectedFighter, selectedPet1, outcome]);

    // Start Battle: generate AI pre-fight taunts and fire the wallet in parallel.
    // The overlay shows a loader until the taunts arrive, then types them out.
    const handleBattle = () => {
        battle.clearErrors();
        taunts.reset();
        setShowResult(false);
        outcome.resetOutcome();
        dialogue.resetResultDialogue();
        setSettledBattleId(null);

        if (!selectedPet1 || !opponent || !selectedFighter || !activeChainKind) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        setValidationError(null);
        setOverlayOpen(true);
        const personas = {
            attacker: toDialoguePet(selectedFighter),
            defender: toDialoguePet(opponent),
        };
        battlePersonasRef.current = personas;
        taunts.generate({ chain: activeChainKind, ...personas });
        startBattle();
    };

    const handleCancel = () => {
        setShowResult(false);
        setOverlayOpen(false);
        taunts.reset();
        setValidationError(null);
        navigate(DASHBOARD_HOME);
    };

    const handleDone = () => {
        setShowResult(false);
        setOverlayOpen(false);
        taunts.reset();
        setValidationError(null);
        outcome.resetOutcome();
        outcome.clearSnapshot();
        setSelectedPet1('');
        setSelectedOpponent('');
        navigate(DASHBOARD_HOME);
    };

    const handleRefreshOpponents = () => {
        void refetchOpponents();
    };

    const flashOpponentSlot = useCallback(() => {
        setOpponentSlotFlash(true);
        window.setTimeout(() => setOpponentSlotFlash(false), 520);
    }, []);

    const handleSelectOpponent = useCallback(
        (key: string) => {
            setSelectedOpponent(key);
            flashOpponentSlot();
        },
        [flashOpponentSlot],
    );

    const handleRandomMatch = () => {
        if (!selectedFighter) {
            setValidationError('Choose your fighter before using random match');
            return;
        }

        const pick = pickRandomOpponent(opponents, selectedFighter.level);
        if (!pick) return;

        setValidationError(null);
        handleSelectOpponent(opponentKey(pick.owner, pick.id));
    };

    const handleRematch = () => {
        battle.clearErrors();
        taunts.reset();
        setShowResult(false);
        setOverlayOpen(true);
        setValidationError(null);
        outcome.resetOutcome();
        dialogue.resetResultDialogue();
        setSettledBattleId(null);
        setRematchPending(true);

        // Generate taunts immediately (mirrors handleBattle) so the dialogue appears as soon as
        // the overlay opens. Use `pets` instead of `readyPets` so a post-battle cooldown on the
        // fighter doesn't prevent the taunt from starting (the cooldown check still blocks the
        // actual battle.mutate call in the rematch useEffect).
        const snapshot = rematchSnapshotRef.current;
        const tauntFighter = snapshot ? pets.find((p) => p.id === snapshot.petId1) : null;
        if (tauntFighter && opponent && activeChainKind) {
            const personas = {
                attacker: toDialoguePet(tauntFighter),
                defender: toDialoguePet(opponent),
            };
            battlePersonasRef.current = personas;
            taunts.generate({ chain: activeChainKind, ...personas });
        }

        refetch();
        void refetchOpponents();
    };

    useEffect(() => {
        if (!selectedOpponent) return;
        selectedOpponentCardRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
    }, [selectedOpponent]);

    // Close the overlay if the battle fails before a result (e.g. wallet rejected),
    // so the user isn't stranded on the taunt/underway screen. The error toast still shows.
    useEffect(() => {
        if (!showResult && (battle.error || battle.receiptError)) {
            setOverlayOpen(false);
            taunts.reset();
        }
    }, [battle.error, battle.receiptError, showResult]);

    useEffect(() => {
        if (!rematchPending || petsLoading || opponentsLoading || opponentsFetching) return;

        setRematchPending(false);
        const snapshot = rematchSnapshotRef.current;
        if (!snapshot) return;

        const fighterReady = readyPets.some(({ id }) => id === snapshot.petId1);
        const opponentMatch = opponents.find(
            (o) => opponentKey(o.owner, o.id) === snapshot.opponentKey,
        );

        if (!fighterReady) {
            setValidationError(REMATCH_COOLDOWN_MESSAGE);
            return;
        }

        if (!opponentMatch) {
            setSelectedOpponent('');
            setValidationError(REMATCH_OPPONENT_GONE_MESSAGE);
            return;
        }

        const rematchFighter = readyPets.find(({ id }) => id === snapshot.petId1)?.pet;
        if (rematchFighter) outcome.snapshotFighterStats(rematchFighter);

        setSelectedPet1(snapshot.petId1);
        setSelectedOpponent(snapshot.opponentKey);
        setValidationError(null);
        void battle.mutate({
            petId1: snapshot.petId1,
            petId2: opponentMatch.id,
            defenderOwner: opponentMatch.owner,
        });
    }, [
        rematchPending,
        petsLoading,
        opponentsLoading,
        opponentsFetching,
        readyPets,
        opponents,
        battle,
        outcome,
        activeChainKind,
    ]);

    // Once the tx hash exists, retain it as the stable battleId for the result
    // read. EVM clears battle.hash on receipt completion, so capture it here.
    // Result dialogue was already pre-generated at taunt time (matchup-keyed), so
    // there's nothing to trigger off the hash beyond keeping the id.
    useEffect(() => {
        const hash = battle.hash;
        if (!hash || !activeChainKind) return;
        setSettledBattleId(hash);
    }, [battle.hash, activeChainKind]);

    const arenaClassName = [
        'battle-arena-card',
        'battle-setup-arena',
        isArenaReady ? 'is-ready' : '',
        isArenaFighting ? 'is-fighting' : '',
        showResult ? 'is-result' : '',
    ]
        .filter(Boolean)
        .join(' ');

    // Pre-result phase (overlay stays open through taunts → battling).
    const isBattling = battle.isPending || battle.isEvmConfirming || rematchPending;
    const preResultTitle = isBattling ? 'The battle is underway…' : 'Face-off!';
    const preResultStatus = rematchPending
        ? 'Preparing rematch…'
        : battle.isEvmConfirming
            ? 'Confirming on-chain…'
            : battle.isPending
                ? 'Awaiting your wallet…'
                : null;

    const battleButtonLabel = taunts.isLoading
        ? 'Facing off…'
        : battle.isPending
            ? pendingLabel
            : battle.isEvmConfirming
                ? 'Confirming...'
                : 'Start Battle';
    const battleDisabled =
        battle.isPending || battle.isEvmConfirming || rematchPending || overlayOpen ||
        !selectedPet1 || !selectedOpponent || showResult;
    const randomMatchDisabled = !canRandomMatch || battle.isPending || showResult;

    const overlay: BattleOverlayProps = {
        open: overlayOpen,
        showResult,
        battleOutcome: outcome.battleOutcome,
        opponent,
        resultTurns: dialogue.resultTurns,
        dialogueLoading: dialogue.dialogueLoading,
        resultAttackerName: dialogue.attackerName,
        resultDefenderName: dialogue.defenderName,
        onResultComplete: dialogue.markResultDialogueDone,
        resultDialogueDone: dialogue.resultDialogueDone,
        onRematch: handleRematch,
        onDone: handleDone,
        rematchPending,
        battlePending: battle.isPending,
        preResultTitle,
        preResultStatus,
        tauntsLoading: taunts.isLoading,
        tauntsTurns: taunts.turns,
        fighterName: selectedFighter?.name ?? 'Your pet',
        opponentName: opponent?.name ?? 'Opponent',
    };

    const setup: BattleSetupProps = {
        isStandaloneView,
        subtitle,
        arenaClassName,
        isArenaFighting,
        isArenaReady,
        showResult,
        selectedFighter,
        opponent,
        opponentSlotFlash,
        randomMatchDisabled,
        onRandomMatch: handleRandomMatch,
        readyPets,
        selectedPet1,
        onSelectFighter: setSelectedPet1,
        sortedOpponents,
        fighterLevel,
        selectedOpponentKey: selectedOpponent,
        onSelectOpponent: handleSelectOpponent,
        selectedOpponentCardRef,
        opponentsLoading,
        onRefreshOpponents: handleRefreshOpponents,
        onBattle: handleBattle,
        battleDisabled,
        battleButtonLabel,
        onCancel: handleCancel,
    };

    return {
        overlay,
        setup,
        hashHint,
        receipt: {
            show: Boolean(battle.tracksEvmReceipt && battle.hash),
            hash: battle.hash,
            onComplete: battle.onEvmReceiptComplete,
            onError: battle.onEvmReceiptError,
        },
    };
}
