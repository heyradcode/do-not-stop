import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getLifePercent,
    getPetAvatar,
    getRarityColor,
    getRarityName,
    getReadyPetsUnified,
    useActiveChain,
    useBattlePets,
    useOpponents,
    usePetList,
    type OpponentPet,
    type Pet,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { formatTxHashHint, usePetActionErrorDisplay } from '@hooks/usePetActionErrorDisplay';
import Icon, { BattleIcon, CheckIcon, CloseIcon, PauseIcon, WarningIcon } from '@components/common/icon';
import './index.css';

export type BattlePanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const VALIDATION_MESSAGE = 'Please select your pet and an opponent';
const BATTLE_FAIL_MESSAGE = 'Failed to start battle. Please try again.';
const SUCCESS_MESSAGE = 'Battle completed! Check your pets for level ups.';

/** Stable select value for an opponent (pet ids are not globally unique on Solana). */
const opponentKey = (owner: string, id: string) => `${owner}::${id}`;
const shortAddress = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

type ArenaSlotProps = {
    pet?: Pet | OpponentPet | null;
    placeholder: string;
    ownerLabel?: string;
};

const ArenaSlot: React.FC<ArenaSlotProps> = ({ pet, placeholder, ownerLabel }) => {
    if (!pet) {
        return (
            <div className="arena-slot is-empty">
                <span className="slot-placeholder">{placeholder}</span>
            </div>
        );
    }

    return (
        <div className="arena-slot is-selected">
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
    selected: boolean;
    onSelect: (key: string) => void;
};

const OpponentPickerCard: React.FC<OpponentPickerCardProps> = ({ opponent, selected, onSelect }) => {
    const key = opponentKey(opponent.owner, opponent.id);

    return (
        <button
            type="button"
            className={`battle-picker-card${selected ? ' is-selected' : ''}`}
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
    const { pets, refetch } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedOpponent, setSelectedOpponent] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    const activeChainKind = chain.kind === 'none' ? null : chain.kind;
    const {
        opponents,
        isLoading: opponentsLoading,
        refetch: refetchOpponents,
    } = useOpponents({ chain: activeChainKind });

    const handleSuccess = useCallback(() => {
        setSuccess(SUCCESS_MESSAGE);
        setSelectedPet1('');
        setSelectedOpponent('');
        void refetch();
        void refetchOpponents();
        navigate(DASHBOARD_HOME);
    }, [navigate, refetch, refetchOpponents]);

    const battle = useBattlePets({ onSuccess: handleSuccess });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const selectedFighter = useMemo(
        () => readyPets.find(({ id }) => id === selectedPet1)?.pet ?? null,
        [readyPets, selectedPet1],
    );
    const opponent = useMemo(
        () => opponents.find((o) => opponentKey(o.owner, o.id) === selectedOpponent),
        [opponents, selectedOpponent],
    );

    const displayError = usePetActionErrorDisplay(
        battle.error,
        battle.receiptError,
        validationError,
        BATTLE_FAIL_MESSAGE,
    );

    const usesSwitchboardVrf = chain.kind === 'solana';
    const subtitle = usesSwitchboardVrf
        ? 'Pick your fighter and an opponent (Switchboard VRF)'
        : 'Pick your fighter and an opponent';
    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Starting Battle...';
    const submitLabel = 'Start Battle';
    const hashHint = chain.kind === 'solana' ? formatTxHashHint(battle.hash) : null;

    const handleBattle = () => {
        battle.clearErrors();
        setSuccess(null);

        if (!selectedPet1 || !opponent) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }
        setValidationError(null);
        void battle.mutate({
            petId1: selectedPet1,
            petId2: opponent.id,
            defenderOwner: opponent.owner,
        });
    };

    const handleCancel = () => {
        setSuccess(null);
        setValidationError(null);
        navigate(DASHBOARD_HOME);
    };

    const handleRefreshOpponents = () => {
        void refetchOpponents();
    };

    const ErrorIcon = displayError.isUserRejection
        ? PauseIcon
        : displayError.isContractError
          ? WarningIcon
          : CloseIcon;
    const errorTone = displayError.isUserRejection
        ? Tones.Inherit
        : displayError.isContractError
          ? Tones.Amber
          : Tones.Magenta;

    return (
        <>
            <div className="interface battle-setup">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Pets</h4>
                        <p>{subtitle}</p>
                    </>
                )}

                <div className="battle-arena-card battle-setup-arena">
                    <div className="header">
                        <span><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Arena</span>
                        <span className="arena-badge">
                            {selectedFighter && opponent ? 'Ready' : 'Setup'}
                        </span>
                    </div>
                    <div className="hub-divider" />
                    <div className="content">
                        <ArenaSlot pet={selectedFighter} placeholder="Choose fighter" />
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
                        <h5 className="section-title">Opponents</h5>
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
                            {opponents.map((o) => (
                                <OpponentPickerCard
                                    key={opponentKey(o.owner, o.id)}
                                    opponent={o}
                                    selected={selectedOpponent === opponentKey(o.owner, o.id)}
                                    onSelect={setSelectedOpponent}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <div className="action-controls">
                    <button
                        type="button"
                        onClick={handleBattle}
                        disabled={battle.isPending || !selectedPet1 || !selectedOpponent}
                    >
                        {battle.isPending ? pendingLabel : submitLabel}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {displayError.message && (
                <div
                    className={`error-message ${displayError.isUserRejection ? 'user-rejection' : ''} ${displayError.isContractError ? 'contract-error' : ''}`}
                >
                    <Icon as={ErrorIcon} tone={errorTone} />
                    {displayError.message}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

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
