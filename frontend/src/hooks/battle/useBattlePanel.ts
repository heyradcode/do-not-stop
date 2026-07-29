import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    getReadyPetsUnified,
    useChainCapabilities,
    useBattlePets,
    useBattleTaunts,
    useCreateBattleRoom,
    useOpponents,
    usePetList,
    useWinEstimate,
    type TxLifecycle,
    type BattleResolvedResult,
    type SimOutcome,
} from '@shared/core';
import { BATTLE_PATH, DASHBOARD_HOME } from '@constants/interactionRoutes';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import {
    pickRandomOpponent,
    sortOpponentsByMatch,
} from '@components/pet/interactions/panels/battle/battle-matchmaking';
import { useBattleOutcome } from './useBattleOutcome';
import { useResultDialogue } from './useResultDialogue';
import { useLiveBattleAnimation, describeMechanicalLogEntry } from './useLiveBattleAnimation';
import {
    BATTLE_FAIL_MESSAGE,
    MISMATCH_NOTICE_MESSAGE,
    VALIDATION_MESSAGE,
    opponentKey,
    toDialoguePet,
    type BattlePersonas,
} from '@components/pet/interactions/panels/battle/battle-utils';
import type { BattleOverlayProps } from '@components/pet/interactions/panels/battle/parts/battle-overlay';
import type { BattleSetupProps } from '@components/pet/interactions/panels/battle/parts/battle-setup';
import type { MechanicalLogLine } from '@components/pet/interactions/panels/battle/types';

interface UseBattlePanelArgs {
    isStandaloneView: boolean;
}

/** How long the mismatch interstitial stays up before revealing the (corrected)
 *  result card — see MISMATCH_NOTICE_MESSAGE / the reconciliation rule below. */
const MISMATCH_NOTICE_DURATION_MS = 2_000;

export interface UseBattlePanel {
    overlay: BattleOverlayProps;
    setup: BattleSetupProps;
    hashHint: string | null;
    /** Battle tx lifecycle, rendered by the phase-driven <TransactionStatus/>. */
    receipt: TxLifecycle;
}

/**
 * Headless controller for the battle panel. Owns all state, refs, queries,
 * handlers, and effects, and returns a view-model wired to the presentational
 * components. The panel component is then a pure view over this hook.
 *
 * Selection and validation are deliberately kept together here rather than
 * split into more hooks: they're tightly coupled (both random-match and
 * battle-start touch validation), so a single controller is the honest seam.
 * The two genuinely isolated concerns — outcome detection and dialogue — live
 * in their own hooks (`useBattleOutcome`, `useResultDialogue`) and are
 * composed below.
 *
 * No rematch action: publishing a receipt puts both participants on a cooldown
 * (`BATTLE_COOLDOWN_SECONDS`, 900s by default) regardless of outcome, so the exact
 * pairing that just fought can never legally re-battle immediately after a result —
 * a same-opponent "Rematch" button would always be rejected. Players re-battle by
 * picking a fresh opponent from the setup screen instead.
 */
export const useBattlePanel = ({ isStandaloneView }: UseBattlePanelArgs): UseBattlePanel => {
    const navigate = useNavigate();
    const location = useLocation();
    const capabilities = useChainCapabilities();
    const { pets, refetch } = usePetList();
    // Pre-select the pet the player clicked "Battle" on from its gallery card
    // (navigate(BATTLE_PATH, { state: { petId } })) — falls back to unselected
    // for the generic nav entry, which carries no state. Only read once, on
    // mount; readyPets/selectedFighter below pick it up reactively once pets load.
    const [selectedPet1, setSelectedPet1] = useState(
        () => (location.state as { petId?: string } | null)?.petId ?? '',
    );
    const [selectedOpponent, setSelectedOpponent] = useState('');
    const [showResult, setShowResult] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    // The battle overlay stays open continuously: taunts → battling → result.
    const [overlayOpen, setOverlayOpen] = useState(false);
    // The battle's tx hash, retained in our own state. EVM clears battle.hash
    // (resetWrite) on receipt completion, so we capture it during confirming to
    // keep a stable battleId for the result dialogue after the battle settles.
    const [settledBattleId, setSettledBattleId] = useState<string | null>(null);
    // The authoritative BattleResolved (or Solana confirm) has arrived — result
    // display still waits on the live animation finishing (see the gating effect
    // below), unless a mismatch was found, in which case it waits on the notice.
    const [hasResolvedEvent, setHasResolvedEvent] = useState(false);
    // Client-side live-replay disagreed with the on-chain result (should be ~never
    // — see plan-realtime-battle-ux.md's reconciliation rule). Shows a brief
    // honest notice instead of silently correcting or showing the wrong winner.
    const [mismatchNotice, setMismatchNotice] = useState(false);

    // Personas captured at battle start. The backend pre-generates the result
    // dialogue when the taunts are requested (keyed by matchup), so nothing
    // hash-triggered is needed here — these are reused for the settle read.
    const battlePersonasRef = useRef<BattlePersonas | null>(null);
    // Set when Start Battle is pressed: the wallet prompt is held until the
    // pre-fight taunts finish playing (so it doesn't pop while they're typing).
    const pendingBattleStartRef = useRef(false);
    // Latest live-replay outcome, read by handleSuccess (defined before `battle`
    // exists) for the mismatch check. Assigned during render each time `battle`
    // updates, keeping the callback identity stable across renders.
    const liveReplayRef = useRef<SimOutcome | null>(null);

    const activeChainKind = capabilities.activeKind;
    const {
        opponents,
        isLoading: opponentsLoading,
        refetch: refetchOpponents,
    } = useOpponents({ chain: activeChainKind });

    // Victory/defeat and level-up, both read straight off the verified receipt.
    const outcome = useBattleOutcome();

    const handleSuccess = useCallback(
        (result: BattleResolvedResult) => {
            setValidationError(null);
            // The verified receipt is authoritative — petId1 is the player's pet, so
            // firstWins is the player's verdict on either chain.
            outcome.applyResolvedOutcome(result.firstWins, result.attackerLeveledUp);
            const local = liveReplayRef.current?.result;
            if (local && local.firstWins !== result.firstWins) {
                console.error('[battle] live-replay mismatch — the signed receipt is authoritative', {
                    receipt: result,
                    local,
                });
                setMismatchNotice(true);
            }
            // Result display gates on the live animation finishing too (or the
            // mismatch notice, if one fired) — see the effect below.
            setHasResolvedEvent(true);
            void refetch();
            void refetchOpponents();
        },
        [outcome, refetch, refetchOpponents],
    );

    const battle = useBattlePets({ onSuccess: handleSuccess });
    liveReplayRef.current = battle.liveReplay;

    // Deliberately not gated on overlayOpen: the animation must keep progressing
    // in the background while the overlay is minimized (handleBack below), so
    // showResult can still become true and auto-reopen the overlay once the
    // battle actually resolves, instead of stalling until the player returns.
    const animation = useLiveBattleAnimation(
        battle.liveReplay?.log ?? null,
        battle.liveReplay?.startHp1 ?? null,
        battle.liveReplay?.startHp2 ?? null,
        !showResult,
    );

    // Reveal the result card once the authoritative event has arrived AND either
    // the live animation has finished or a mismatch cut it short (interstitial
    // instead). Never earlier — the verdict is never shown from the local sim.
    useEffect(() => {
        if (!hasResolvedEvent) return;
        if (mismatchNotice) {
            const timer = setTimeout(() => {
                setMismatchNotice(false);
                setShowResult(true);
            }, MISMATCH_NOTICE_DURATION_MS);
            return () => clearTimeout(timer);
        }
        if (animation.done) setShowResult(true);
    }, [hasResolvedEvent, mismatchNotice, animation.done]);

    // If the overlay was minimized (handleBack) while the battle was still in
    // flight, bring it back the moment the result is ready to show — so a
    // minimized battle can never resolve silently in the background.
    useEffect(() => {
        if (showResult) setOverlayOpen(true);
    }, [showResult]);
    // AI pre-fight taunts — generated on Start Battle, in parallel with the wallet.
    // Requesting taunts also kicks off result pregen on the backend.
    const taunts = useBattleTaunts();
    // Shareable room URL — minted alongside the taunts on Start Battle (see
    // handleBattle below), before the wallet has even signed, since no
    // on-chain identifier (tx hash / requestId) exists yet at that point.
    const { createRoom, isLoading: roomLoading } = useCreateBattleRoom();

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

    const winEstimate = useWinEstimate(activeChainKind, selectedPet1 || null, opponent?.id ?? null);

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

    // Receipt errors are folded into `battle.error` by the chain adapter.
    usePetErrorToast(battle.error, null, validationError, BATTLE_FAIL_MESSAGE);

    const canRandomMatch = Boolean(selectedFighter) && opponents.length > 0 && !opponentsLoading;
    // Chain-blind: a battle is seeded from a committed drand round on either chain, so
    // there is no per-chain VRF provider to name here any more.
    const subtitle = 'Pick your fighter and an opponent';
    const pendingLabel = 'Starting Battle...';
    // The battle id, shown so a player can look their receipt up later. Falls back to the
    // retained id: `battle.hash` clears once the battle settles, the hint should not.
    const hashHint = formatTxHashHint(battle.hash ?? settledBattleId ?? undefined);

    const startBattle = useCallback(() => {
        if (!selectedPet1 || !opponent) {
            setValidationError(VALIDATION_MESSAGE);
            return false;
        }

        setValidationError(null);
        void battle.mutate({
            petId1: selectedPet1,
            petId2: opponent.id,
            defenderOwner: opponent.owner,
        });
        return true;
    }, [battle, opponent, selectedPet1]);

    // Start Battle: generate AI pre-fight taunts, then hold the wallet prompt until
    // they finish playing (handleTauntsComplete / the empty-taunts fallback effect
    // fire startBattle). The overlay shows a loader until the taunts arrive, then
    // types them out. The backend pregen still kicks off at taunt-request time, so
    // the deferred wallet doesn't cost the result read any latency.
    const handleBattle = () => {
        battle.clearErrors();
        taunts.reset();
        pendingBattleStartRef.current = false;
        setShowResult(false);
        setHasResolvedEvent(false);
        setMismatchNotice(false);
        outcome.resetOutcome();
        dialogue.resetResultDialogue();
        setSettledBattleId(null);

        if (!selectedPet1 || !opponent || !selectedFighter || !activeChainKind) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        setValidationError(null);

        // Mint the shareable room URL first — the Start Battle button shows a
        // loading state (roomLoading, from useCreateBattleRoom) until this
        // resolves, then the overlay opens and taunts/wallet proceed. Best-effort:
        // a failure still lets the battle proceed, just without a room URL for
        // this attempt (see useCreateBattleRoom's header comment).
        void createRoom({
            chain: activeChainKind,
            attackerPetId: selectedFighter.id,
            defenderPetId: opponent.id,
        }).then((roomId) => {
            if (roomId) navigate(`${BATTLE_PATH}/${roomId}`, { replace: true });

            setOverlayOpen(true);
            const personas = {
                attacker: toDialoguePet(selectedFighter),
                defender: toDialoguePet(opponent),
            };
            battlePersonasRef.current = personas;
            pendingBattleStartRef.current = true;
            taunts.generate({ chain: activeChainKind, ...personas });
        });
    };

    // The taunts finished typing — now prompt the wallet for the held battle.
    const handleTauntsComplete = useCallback(() => {
        if (!pendingBattleStartRef.current) return;
        pendingBattleStartRef.current = false;
        startBattle();
    }, [startBattle]);

    // Fallback: if the taunts errored / produced nothing, don't strand the battle —
    // start it once generation settles empty (onComplete never fires with no turns).
    useEffect(() => {
        if (!pendingBattleStartRef.current) return;
        if (!taunts.isLoading && taunts.turns.length === 0) {
            pendingBattleStartRef.current = false;
            startBattle();
        }
    }, [taunts.isLoading, taunts.turns.length, startBattle]);

    // Minimizes the overlay ("back") without touching any in-flight battle
    // state — the wallet tx, taunts, and live-replay animation all keep
    // running; the auto-reopen effect above brings the overlay back once
    // the result is ready, so a minimized battle can't resolve unseen.
    const handleBack = () => {
        setOverlayOpen(false);
    };

    const handleCancel = () => {
        setShowResult(false);
        setHasResolvedEvent(false);
        setMismatchNotice(false);
        setOverlayOpen(false);
        pendingBattleStartRef.current = false;
        taunts.reset();
        setValidationError(null);
        navigate(DASHBOARD_HOME);
    };

    const handleDone = () => {
        setShowResult(false);
        setHasResolvedEvent(false);
        setMismatchNotice(false);
        setOverlayOpen(false);
        taunts.reset();
        setValidationError(null);
        outcome.resetOutcome();
        setSelectedPet1('');
        setSelectedOpponent('');
        navigate(DASHBOARD_HOME);
    };

    const handleRefreshOpponents = () => {
        void refetchOpponents();
    };

    // Re-plays the just-finished fight from the first strike. Reuses the same
    // showResult/animation.done gate that reveals the result card in the first place:
    // flipping showResult back to false resumes the animation (active = !showResult),
    // and the effect above flips it back to true on its own once animation.done is true
    // again — no separate "replaying" state needed.
    const handleWatchReplay = useCallback(() => {
        animation.replay();
        setShowResult(false);
    }, [animation]);

    const handleSelectOpponent = useCallback((key: string) => {
        setSelectedOpponent(key);
    }, []);

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

    // Close the overlay if the battle fails before a result (e.g. wallet rejected),
    // so the user isn't stranded on the taunt/underway screen. The error toast still shows.
    useEffect(() => {
        if (!showResult && battle.error) {
            setOverlayOpen(false);
            pendingBattleStartRef.current = false;
            taunts.reset();
        }
    }, [taunts, battle.error, showResult]);

    // Once the tx hash exists, retain it as the stable battleId for the result
    // read. EVM clears battle.hash on receipt completion, so capture it here.
    // Result dialogue was already pre-generated at taunt time (matchup-keyed), so
    // there's nothing to trigger off the hash beyond keeping the id.
    useEffect(() => {
        const hash = battle.hash;
        if (!hash || !activeChainKind) return;
        setSettledBattleId(hash);
    }, [battle.hash, activeChainKind]);


    // Pre-result phase (overlay stays open through taunts → battling).
    const isBattling = battle.isPending || battle.isConfirming;
    const preResultTitle = isBattling ? 'The battle is underway…' : 'Face-off!';
    // EVM v2 battle is async: request → VRF → settle. Label each phase so the
    // long VRF wait doesn't keep showing "Awaiting your wallet". The live-replay
    // states take priority once entropy has revealed (see the gating effect
    // above): the result card itself never appears until hasResolvedEvent AND
    // (animation.done OR the mismatch notice has run its course).
    const preResultStatus = mismatchNotice
        ? MISMATCH_NOTICE_MESSAGE
        : hasResolvedEvent && !animation.done
        ? 'Result in — playing out the fight…'
        : !hasResolvedEvent && animation.done && battle.liveReplay
        ? 'Finalizing…'
        : battle.phase === 'awaiting-vrf'
        ? 'Awaiting randomness…'
        : battle.phase === 'resolving'
        ? 'Resolving the outcome…'
        : battle.isConfirming
        ? 'Verifying the receipt…'
        : battle.isPending
        ? 'Awaiting your wallet…'
        : null;

    const battleButtonLabel = roomLoading
        ? 'Preparing…'
        : taunts.isLoading
        ? 'Facing off…'
        : battle.isPending
        ? pendingLabel
        : battle.isConfirming
        ? 'Confirming...'
        : 'Start Battle';
    const battleDisabled =
        roomLoading ||
        battle.isPending ||
        battle.isConfirming ||
        overlayOpen ||
        !selectedPet1 ||
        !selectedOpponent ||
        showResult;
    const randomMatchDisabled = !canRandomMatch || battle.isPending || showResult;

    const fighterDisplayName = selectedFighter?.name ?? 'Your pet';
    const opponentDisplayName = opponent?.name ?? 'Opponent';
    // Mechanical (round-by-round) log for the bottom log panel — null (not just empty)
    // when there's no live-replay feature this deployment (Solana, or an EVM deployment
    // with no GameConfig wired up), same fallback rule as liveHp1Percent/liveHp2Percent below.
    const liveLog: MechanicalLogLine[] | null = useMemo(
        () =>
            battle.liveReplay
                ? animation.history.map((entry) => ({
                      text: describeMechanicalLogEntry(entry, fighterDisplayName, opponentDisplayName),
                      isFighter: entry.attacker === 1,
                  }))
                : null,
        [battle.liveReplay, animation.history, fighterDisplayName, opponentDisplayName],
    );

    const overlay: BattleOverlayProps = {
        open: overlayOpen,
        showResult,
        battleOutcome: outcome.battleOutcome,
        fighter: selectedFighter,
        opponent,
        resultTurns: dialogue.resultTurns,
        dialogueLoading: dialogue.dialogueLoading,
        resultAttackerName: dialogue.attackerName,
        resultDefenderName: dialogue.defenderName,
        onResultComplete: dialogue.markResultDialogueDone,
        resultDialogueDone: dialogue.resultDialogueDone,
        onDone: handleDone,
        onBack: handleBack,
        preResultTitle,
        preResultStatus,
        tauntsLoading: taunts.isLoading,
        tauntsTurns: taunts.turns,
        onTauntsComplete: handleTauntsComplete,
        fighterName: fighterDisplayName,
        opponentName: opponentDisplayName,
        // Live-replay animation (plan-realtime-battle-impl.md Phase 4): only
        // populated once entropy has revealed and the sim inputs are known;
        // battle-overlay falls back to its existing static HP display otherwise
        // (Solana, or an EVM deployment with no GameConfig wired up).
        liveHp1Percent: battle.liveReplay ? animation.hp1Percent : null,
        liveHp2Percent: battle.liveReplay ? animation.hp2Percent : null,
        liveLog,
        liveFlourish: animation.flourish,
        // Nothing to replay without a live-replay log (Solana, or an EVM deployment with
        // no GameConfig wired up — see the liveLog comment above for the same fallback rule).
        canReplay: Boolean(battle.liveReplay?.log?.length),
        onWatchReplay: handleWatchReplay,
    };

    const setup: BattleSetupProps = {
        isStandaloneView,
        subtitle,
        selectedFighter,
        opponent,
        randomMatchDisabled,
        onRandomMatch: handleRandomMatch,
        readyPets,
        selectedPet1,
        onSelectFighter: setSelectedPet1,
        sortedOpponents,
        selectedOpponentKey: selectedOpponent,
        onSelectOpponent: handleSelectOpponent,
        opponentsLoading,
        onRefreshOpponents: handleRefreshOpponents,
        onBattle: handleBattle,
        battleDisabled,
        battleButtonLabel,
        onCancel: handleCancel,
        winEstimate,
    };

    return {
        overlay,
        setup,
        hashHint,
        receipt: battle.lifecycle,
    };
};
