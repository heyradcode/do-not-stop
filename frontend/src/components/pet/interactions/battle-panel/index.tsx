import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import { getReadyPetsUnified, useActiveChain, useBattlePets, useOpponents, usePetList } from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { formatTxHashHint, usePetActionErrorDisplay } from '@hooks/usePetActionErrorDisplay';
import Icon, { BattleIcon, CheckIcon, CloseIcon, PauseIcon, WarningIcon } from '@components/common/icon';

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
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Pets</h4>
                        <p>{subtitle}</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>First Fighter</label>
                        <select
                            value={selectedPet1}
                            onChange={(e) => setSelectedPet1(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>Opponent</label>
                        <select
                            value={selectedOpponent}
                            onChange={(e) => setSelectedOpponent(e.target.value)}
                            disabled={opponentsLoading || opponents.length === 0}
                        >
                            <option value="">
                                {opponentsLoading
                                    ? 'Finding opponents…'
                                    : opponents.length === 0
                                      ? 'No opponents available'
                                      : 'Select opponent...'}
                            </option>
                            {opponents.map((o) => (
                                <option key={opponentKey(o.owner, o.id)} value={opponentKey(o.owner, o.id)}>
                                    {o.name} (Level {o.level}) · {shortAddress(o.owner)} · {o.winCount}W/{o.lossCount}L
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

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
