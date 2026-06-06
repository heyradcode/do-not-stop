import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getLifePercent,
    getPetAvatar,
    getRarityColor,
    getRarityName,
    getReadyPetsUnified,
    useActiveChain,
    useBattleDialogue,
    useBattlePets,
    useBattleTaunts,
    useOpponents,
    usePetList,
    usePrepareDialogue,
    type DialoguePetInput,
    type OpponentPet,
    type Pet,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import Icon, { BattleIcon } from '@components/ui/icon';
import {
    getLevelDelta,
    getMatchLabel,
    getMatchTier,
    pickRandomOpponent,
    sortOpponentsByMatch,
} from './battle-matchmaking';
import BattleResultArt from './battle-result-art';
import BattleDialogue from './battle-dialogue';
import type { BattleOutcome } from './types';
import './index.css';

/** Map a pet/opponent to the persona input the dialogue endpoint expects. */
const toDialoguePet = (pet: Pet | OpponentPet): DialoguePetInput => ({
    petId: pet.id,
    name: pet.name,
    level: pet.level,
    rarity: pet.rarity,
    dna: pet.dna.toString(),
    winCount: pet.winCount,
    lossCount: pet.lossCount,
});

export type BattlePanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const VALIDATION_MESSAGE = 'Please select your pet and an opponent';
const BATTLE_FAIL_MESSAGE = 'Failed to start battle. Please try again.';
const REMATCH_COOLDOWN_MESSAGE = 'Your fighter is on cooldown. Pick another pet or wait.';
const REMATCH_OPPONENT_GONE_MESSAGE = 'That opponent is no longer available. Choose another challenger.';

/** win/loss/levelUp snapshot taken just before calling battle.mutate. */
type PreBattleStats = { winCount: number; lossCount: number; level: number };

/** Stable select value for an opponent (pet ids are not globally unique on Solana). */
const opponentKey = (owner: string, id: string) => `${owner}::${id}`;
const shortAddress = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

type ArenaSlotProps = {
    pet?: Pet | OpponentPet | null;
    placeholder: string;
    ownerLabel?: string;
    side: 'fighter' | 'opponent';
    flash?: boolean;
};

const ArenaSlot: React.FC<ArenaSlotProps> = ({ pet, placeholder, ownerLabel, side, flash }) => {
    if (!pet) {
        return (
            <div className={`arena-slot is-empty arena-slot-${side}`}>
                <span className="slot-placeholder">{placeholder}</span>
            </div>
        );
    }

    return (
        <div
            key={`${side}-${pet.id}`}
            className={`arena-slot is-selected arena-slot-${side}${flash ? ' is-flash' : ''}`}
        >
            <div className="slot-row">
                <span className="slot-avatar" aria-hidden>
                    {getPetAvatar(pet.dna)}
                </span>
                <div className="slot-meta">
                    <span className="slot-name">{pet.name}</span>
                    <span className="slot-sub">
                        Lv.{pet.level}
                        {ownerLabel ? ` · ${ownerLabel}` : ''}
                    </span>
                </div>
            </div>
            <div className="life-track" aria-hidden>
                <div className="life-fill" style={{ width: `${getLifePercent(pet)}%` }} />
            </div>
        </div>
    );
};

type FighterPickerCardProps = {
    pet: Pet;
    petId: string;
    selected: boolean;
    onSelect: (petId: string) => void;
};

const FighterPickerCard: React.FC<FighterPickerCardProps> = ({ pet, petId, selected, onSelect }) => (
    <button
        type="button"
        className={`battle-picker-card${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(petId)}
    >
        <div className="card-top">
            <span className="card-avatar" aria-hidden>
                {getPetAvatar(pet.dna)}
            </span>
            <div className="card-body">
                <span className="card-name">{pet.name}</span>
                <span className="card-meta">Lv.{pet.level}</span>
            </div>
        </div>
        <div className="card-stats">
            <span className="stat-pill rarity" style={{ backgroundColor: getRarityColor(pet.rarity) }}>
                {getRarityName(pet.rarity)}
            </span>
            <span className="stat-pill">
                {pet.winCount}W / {pet.lossCount}L
            </span>
        </div>
    </button>
);

type OpponentPickerCardProps = {
    opponent: OpponentPet;
    fighterLevel: number | null;
    selected: boolean;
    onSelect: (key: string) => void;
    cardRef?: React.Ref<HTMLButtonElement>;
};

const OpponentPickerCard: React.FC<OpponentPickerCardProps> = ({
    opponent,
    fighterLevel,
    selected,
    onSelect,
    cardRef,
}) => {
    const key = opponentKey(opponent.owner, opponent.id);
    const levelDelta = getLevelDelta(fighterLevel, opponent.level);
    const matchTier = getMatchTier(levelDelta);
    const matchLabel = getMatchLabel(matchTier, levelDelta);

    return (
        <button
            ref={cardRef}
            type="button"
            className={`battle-picker-card${selected ? ' is-selected' : ''}${matchTier !== 'unknown' ? ` match-${matchTier}` : ''}`}
            aria-pressed={selected}
            onClick={() => onSelect(key)}
        >
            <div className="card-top">
                <span className="card-avatar" aria-hidden>
                    {getPetAvatar(opponent.dna)}
                </span>
                <div className="card-body">
                    <span className="card-name">{opponent.name}</span>
                    <span className="card-meta">
                        Lv.{opponent.level} · {shortAddress(opponent.owner)}
                    </span>
                </div>
            </div>
            <div className="card-stats">
                {matchLabel ? (
                    <span className={`stat-pill match-${matchTier}`}>{matchLabel}</span>
                ) : null}
                <span className="stat-pill rarity" style={{ backgroundColor: getRarityColor(opponent.rarity) }}>
                    {getRarityName(opponent.rarity)}
                </span>
                <span className="stat-pill">
                    {opponent.winCount}W / {opponent.lossCount}L
                </span>
            </div>
        </button>
    );
};

const BattlePanel: React.FC<BattlePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch, isLoading: petsLoading } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedOpponent, setSelectedOpponent] = useState('');
    const [showResult, setShowResult] = useState(false);
    const [battleOutcome, setBattleOutcome] = useState<BattleOutcome>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [opponentSlotFlash, setOpponentSlotFlash] = useState(false);
    const [rematchPending, setRematchPending] = useState(false);
    // The battle overlay stays open continuously: taunts → battling → result.
    const [overlayOpen, setOverlayOpen] = useState(false);
    // Gates the result actions (Rematch/Leave) until the post-battle dialogue
    // has finished playing — or until we know there's no dialogue to wait for.
    const [resultDialogueDone, setResultDialogueDone] = useState(false);
    // The battle's tx hash, retained in our own state. EVM clears battle.hash
    // (resetWrite) on receipt completion, so we capture it during confirming to
    // keep a stable battleId for the result dialogue after the battle settles.
    const [settledBattleId, setSettledBattleId] = useState<string | null>(null);

    const selectedOpponentCardRef = useRef<HTMLButtonElement>(null);
    const rematchSnapshotRef = useRef<{ petId1: string; opponentKey: string } | null>(null);
    // Snapshot taken before battle.mutate; cleared after outcome is resolved.
    const preBattleStatsRef = useRef<PreBattleStats | null>(null);
    // Set true in handleSuccess; cleared once the outcome useEffect resolves it.
    const pendingOutcomeRef = useRef(false);
    // Personas captured at battle start so result dialogue can be pre-generated
    // once the tx hash is known. preparedHashRef dedupes the fire.
    const battlePersonasRef = useRef<{ attacker: DialoguePetInput; defender: DialoguePetInput } | null>(null);
    const preparedHashRef = useRef<string | null>(null);

    const activeChainKind = chain.kind === 'none' ? null : chain.kind;
    const {
        opponents,
        isLoading: opponentsLoading,
        isFetching: opponentsFetching,
        refetch: refetchOpponents,
    } = useOpponents({ chain: activeChainKind });

    const handleSuccess = useCallback(() => {
        setShowResult(true);
        setValidationError(null);
        pendingOutcomeRef.current = true;
        void refetch();
        void refetchOpponents();
    }, [refetch, refetchOpponents]);

    const battle = useBattlePets({ onSuccess: handleSuccess });
    // AI pre-fight taunts — generated on Start Battle, in parallel with the wallet.
    const taunts = useBattleTaunts();
    // Pre-generate result dialogue once the tx hash is known.
    const { prepare: prepareDialogue } = usePrepareDialogue();
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

    usePetErrorToast(
        battle.error,
        battle.receiptError,
        validationError,
        BATTLE_FAIL_MESSAGE,
    );

    // After the settle tx, refetch() updates `pets` with the new on-chain stats.
    // Compare against the pre-battle snapshot to determine victory or defeat.
    useEffect(() => {
        if (!pendingOutcomeRef.current || !selectedPet1 || !preBattleStatsRef.current || petsLoading) return;

        const updatedFighter = pets.find((p) => p.id === selectedPet1);
        if (!updatedFighter) return;

        const { winCount: prevWin, lossCount: prevLoss, level: prevLevel } = preBattleStatsRef.current;
        // Stats haven't refreshed yet — wait for the next update.
        if (updatedFighter.winCount === prevWin && updatedFighter.lossCount === prevLoss) return;

        setBattleOutcome({
            result: updatedFighter.winCount > prevWin ? 'victory' : 'defeat',
            leveledUp: updatedFighter.level > prevLevel,
        });
        pendingOutcomeRef.current = false;
    }, [pets, selectedPet1, petsLoading]);

    // AI battle dialogue — generated once the outcome is known, keyed by tx hash.
    const dialogueWinner =
        battleOutcome === null ? null : battleOutcome.result === 'victory' ? 'attacker' : 'defender';
    // Fall back to the personas captured at battle start. After a battle the
    // fighter goes on cooldown and drops out of readyPets (selectedFighter →
    // null), which would otherwise disable the result dialogue query and the
    // pre-generated result would never be fetched. The captured personas survive
    // cooldown and match exactly what was pre-generated.
    const attackerDialogueInput = useMemo(
        () => (selectedFighter ? toDialoguePet(selectedFighter) : battlePersonasRef.current?.attacker ?? null),
        [selectedFighter],
    );
    const defenderDialogueInput = useMemo(
        () => (opponent ? toDialoguePet(opponent) : battlePersonasRef.current?.defender ?? null),
        [opponent],
    );
    const {
        turns: dialogueTurns,
        isLoading: dialogueLoading,
        isFetched: dialogueFetched,
    } = useBattleDialogue({
        chain: activeChainKind,
        battleId: settledBattleId,
        attacker: attackerDialogueInput,
        defender: defenderDialogueInput,
        winner: dialogueWinner,
        leveledUp: battleOutcome?.leveledUp ?? false,
        enabled: showResult && battleOutcome !== null,
    });
    // Taunts already played pre-fight — only show the AI result reactions here.
    const resultTurns = useMemo(
        () => dialogueTurns.filter((t) => t.phase === 'result'),
        [dialogueTurns],
    );

    // Don't leave the result actions gated when no dialogue will play: either the
    // query settled with nothing (generation failed / no result lines), or it
    // can't run at all (no battleId yet). isFetched (not !isLoading) avoids the
    // brief pre-fetch window. onComplete handles the case where it does play.
    useEffect(() => {
        if (battleOutcome === null) return;
        const nothingToPlay = resultTurns.length === 0 && (dialogueFetched || settledBattleId === null);
        if (nothingToPlay) setResultDialogueDone(true);
    }, [battleOutcome, dialogueFetched, resultTurns.length, settledBattleId]);

    const usesSwitchboardVrf = chain.kind === 'solana';
    const canRandomMatch = Boolean(selectedFighter) && opponents.length > 0 && !opponentsLoading;
    const subtitle = usesSwitchboardVrf
        ? 'Pick your fighter and an opponent (Switchboard VRF)'
        : 'Pick your fighter and an opponent';
    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Starting Battle...';
    const confirmingLabel = 'Confirming...';
    const submitLabel = 'Start Battle';
    const hashHint = chain.kind === 'solana' ? formatTxHashHint(battle.hash) : null;

    const snapshotFighterStats = useCallback((fighter: Pet) => {
        preBattleStatsRef.current = {
            winCount: fighter.winCount,
            lossCount: fighter.lossCount,
            level: fighter.level,
        };
        pendingOutcomeRef.current = false;
        setBattleOutcome(null);
    }, []);

    const startBattle = useCallback(() => {
        if (!selectedPet1 || !opponent) {
            setValidationError(VALIDATION_MESSAGE);
            return false;
        }

        if (selectedFighter) snapshotFighterStats(selectedFighter);

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
    }, [battle, opponent, selectedFighter, selectedPet1, snapshotFighterStats]);

    // Start Battle: generate AI pre-fight taunts and fire the wallet in parallel.
    // The overlay shows a loader until the taunts arrive, then types them out.
    const handleBattle = () => {
        battle.clearErrors();
        taunts.reset();
        setShowResult(false);
        setBattleOutcome(null);
        setResultDialogueDone(false);
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
        setBattleOutcome(null);
        preBattleStatsRef.current = null;
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
        setBattleOutcome(null);
        setResultDialogueDone(false);
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
        if (rematchFighter) snapshotFighterStats(rematchFighter);

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
        snapshotFighterStats,
        activeChainKind,
    ]);

    // Once the tx hash exists (battle is confirming on-chain), pre-generate
    // BOTH result outcomes so the result read is served instantly.
    // Fires once per battle hash; the winner is unknown here, so the backend
    // generates both and picks the right one when the result lands.
    useEffect(() => {
        const hash = battle.hash;
        if (!hash || !activeChainKind) return;
        // Retain the hash before EVM clears it on receipt completion, so the
        // result dialogue keeps a stable battleId once the battle settles.
        setSettledBattleId(hash);

        const personas = battlePersonasRef.current;
        if (!personas) return;
        if (preparedHashRef.current === hash) return;
        preparedHashRef.current = hash;
        prepareDialogue({ chain: activeChainKind, battleId: hash, ...personas });
    }, [battle.hash, activeChainKind, prepareDialogue]);

    const arenaClassName = [
        'battle-arena-card',
        'battle-setup-arena',
        isArenaReady ? 'is-ready' : '',
        isArenaFighting ? 'is-fighting' : '',
        showResult ? 'is-result' : '',
    ]
        .filter(Boolean)
        .join(' ');

    // Result overlay derivations
    const isVictory = battleOutcome?.result === 'victory';
    const isDefeat = battleOutcome?.result === 'defeat';
    const resultCardClass = [
        'battle-result-card',
        battleOutcome === null ? 'is-pending' : isVictory ? '' : 'is-defeat',
    ].filter(Boolean).join(' ');

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

    return (
        <>
            {overlayOpen && (
                <div className="battle-result-overlay" role="status" aria-live="polite">
                    <div className={resultCardClass}>
                        {showResult ? (
                            <>
                                <div className="battle-result-art" aria-hidden>
                                    <BattleResultArt outcome={battleOutcome} />
                                </div>
                                <p className="battle-result-title">
                                    {battleOutcome === null
                                        ? 'Resolving…'
                                        : isVictory
                                            ? 'Victory!'
                                            : 'Defeated'}
                                </p>
                                <p className="battle-result-message">
                                    {battleOutcome === null
                                        ? 'Checking battle outcome…'
                                        : isVictory
                                            ? battleOutcome.leveledUp
                                                ? 'Your pet won and leveled up!'
                                                : 'Your pet won the battle!'
                                            : 'Your pet was defeated. Train harder and try again!'}
                                </p>
                                {opponent && battleOutcome !== null ? (
                                    <p className="battle-result-opponent">
                                        {isVictory
                                            ? `vs ${opponent.name} (Lv.${opponent.level})`
                                            : `Lost to ${opponent.name} (Lv.${opponent.level})`}
                                    </p>
                                ) : null}
                                {battleOutcome !== null && (dialogueLoading || resultTurns.length > 0) ? (
                                    <BattleDialogue
                                        turns={resultTurns}
                                        isLoading={dialogueLoading}
                                        attackerName={attackerDialogueInput?.name ?? 'Your pet'}
                                        defenderName={defenderDialogueInput?.name ?? 'Opponent'}
                                        onComplete={() => setResultDialogueDone(true)}
                                    />
                                ) : null}
                                {battleOutcome !== null && (
                                    <div className="battle-result-actions">
                                        <button
                                            type="button"
                                            className={`battle-result-rematch${isDefeat ? ' is-defeat' : ''}`}
                                            onClick={handleRematch}
                                            disabled={battle.isPending || rematchPending || !resultDialogueDone}
                                        >
                                            {rematchPending ? 'Preparing…' : 'Rematch'}
                                        </button>
                                        <button
                                            type="button"
                                            className="battle-result-done"
                                            onClick={handleDone}
                                            disabled={!resultDialogueDone}
                                        >
                                            Leave
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="battle-result-title">{preResultTitle}</p>
                                {taunts.isLoading || taunts.turns.length > 0 ? (
                                    <BattleDialogue
                                        turns={taunts.turns}
                                        isLoading={taunts.isLoading}
                                        attackerName={selectedFighter?.name ?? 'Your pet'}
                                        defenderName={opponent?.name ?? 'Opponent'}
                                    />
                                ) : null}
                                {preResultStatus ? (
                                    <p className="battle-result-message">{preResultStatus}</p>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="interface battle-setup">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Pets</h4>
                        <p>{subtitle}</p>
                    </>
                )}

                <div className={arenaClassName}>
                    <div className="header">
                        <span><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Arena</span>
                        <div className="arena-actions">
                            <button
                                type="button"
                                className="section-action section-action-primary"
                                onClick={handleRandomMatch}
                                disabled={!canRandomMatch || battle.isPending || showResult}
                                title={
                                    selectedFighter
                                        ? 'Pick a random opponent near your fighter level'
                                        : 'Select your fighter first'
                                }
                            >
                                Random match
                            </button>
                            <span className="arena-badge">
                                {isArenaFighting ? 'Fighting' : showResult ? 'Complete' : isArenaReady ? 'Ready' : 'Setup'}
                            </span>
                        </div>
                    </div>
                    <div className="hub-divider" />
                    <div className="content">
                        <ArenaSlot pet={selectedFighter} placeholder="Choose fighter" side="fighter" />
                        <div className="center">
                            <div className="icon">
                                <Icon as={BattleIcon} tone={Tones.Magenta} glow="strong" className="no-gap" size={18} />
                            </div>
                            <div className="vs">VS</div>
                        </div>
                        <ArenaSlot
                            pet={opponent}
                            placeholder="Select opponent"
                            ownerLabel={opponent ? shortAddress(opponent.owner) : undefined}
                            side="opponent"
                            flash={opponentSlotFlash}
                        />
                    </div>
                </div>

                <section className="battle-picker-section" aria-label="Your fighters">
                    <div className="section-head">
                        <h5 className="section-title">Your fighters</h5>
                    </div>
                    {readyPets.length === 0 ? (
                        <div className="battle-picker-empty">
                            No ready pets. Wait for cooldowns to finish before battling.
                        </div>
                    ) : (
                        <div className="battle-picker-strip">
                            {readyPets.map(({ id, pet }) => (
                                <FighterPickerCard
                                    key={id}
                                    pet={pet}
                                    petId={id}
                                    selected={selectedPet1 === id}
                                    onSelect={setSelectedPet1}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <section className="battle-picker-section" aria-label="Opponents">
                    <div className="section-head">
                        <h5 className="section-title">
                            Opponents
                            {fighterLevel != null ? (
                                <span className="section-hint"> · sorted by level match</span>
                            ) : null}
                        </h5>
                        <button
                            type="button"
                            className="section-action"
                            onClick={handleRefreshOpponents}
                            disabled={opponentsLoading}
                        >
                            {opponentsLoading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>
                    {opponentsLoading && opponents.length === 0 ? (
                        <div className="battle-picker-empty">Finding challengers in the arena…</div>
                    ) : opponents.length === 0 ? (
                        <div className="battle-picker-empty">
                            No opponents available right now. Check back after more players join the roster.
                        </div>
                    ) : (
                        <div className="battle-opponent-grid">
                            {sortedOpponents.map((o) => {
                                const key = opponentKey(o.owner, o.id);
                                return (
                                    <OpponentPickerCard
                                        key={key}
                                        opponent={o}
                                        fighterLevel={fighterLevel}
                                        selected={selectedOpponent === key}
                                        onSelect={handleSelectOpponent}
                                        cardRef={selectedOpponent === key ? selectedOpponentCardRef : undefined}
                                    />
                                );
                            })}
                        </div>
                    )}
                </section>

                <div className="action-controls">
                    <AuthActionButton
                        onClick={handleBattle}
                        disabled={battle.isPending || battle.isEvmConfirming || rematchPending || overlayOpen || !selectedPet1 || !selectedOpponent || showResult}
                    >
                        {taunts.isLoading ? 'Facing off…' : battle.isPending ? pendingLabel : battle.isEvmConfirming ? confirmingLabel : submitLabel}
                    </AuthActionButton>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {hashHint && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {hashHint}
                </p>
            )}

            {battle.tracksEvmReceipt && battle.hash && (
                <TransactionStatus
                    hash={battle.hash}
                    onComplete={battle.onEvmReceiptComplete}
                    onError={battle.onEvmReceiptError}
                />
            )}
        </>
    );
};

export default BattlePanel;
