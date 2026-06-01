import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getReadyPetsUnified,
    useActiveChain,
    usePetList,
    useRenamePet,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useNotifyError, useNotifyReceiptError } from '@hooks/useNotifyError';
import { useWriteContractErrorToast } from '@hooks/useWriteContractErrorToast';
import Icon, { CheckIcon, QuillIcon } from '@components/common/icon';
import { Tones } from '@constants/tones';

export type RenamePanelProps = {
    isStandaloneView?: boolean;
};

const RenamePanel: React.FC<RenamePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset } = useRenamePet();
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const notifyError = useNotifyError();
    const notifyReceiptError = useNotifyReceiptError();

    useWriteContractErrorToast(hookError);

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [newName, setNewName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    const selectablePets = useMemo(
        () => (chain.kind === 'evm' ? readyPets.filter(({ pet }) => pet.level >= 2) : readyPets),
        [readyPets, chain.kind]
    );

    const handleChangeName = async () => {
        if (!selectedPet || !newName.trim()) {
            notifyError('Please select a pet and enter a new name', undefined, 'rename-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: selectedPet, name: newName.trim() });
            if (chain.kind === 'solana') {
                setSuccess(`Pet name changed to "${newName}"!`);
                setSelectedPet('');
                setNewName('');
                refetch();
                navigate(DASHBOARD_HOME);
            }
        } catch (err) {
            console.error('[rename]', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess(`Pet name changed to "${newName}"!`);
        setSelectedPet('');
        setNewName('');
        refetch();
        navigate(DASHBOARD_HOME);
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={QuillIcon} tone={Tones.Cyan} />Change Pet Name</h4>
                        <p>
                            {chain.kind === 'evm'
                                ? "Change your pet's name (requires level 2+)"
                                : "Change your pet's name"}
                        </p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>Select Pet</label>
                        <select
                            value={selectedPet}
                            onChange={(e) => setSelectedPet(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {selectablePets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>New Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Enter new name..."
                            maxLength={20}
                        />
                    </div>
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleChangeName} disabled={isPending || !selectedPet || !newName.trim()}>
                        {isPending ? 'Changing Name...' : 'Change Name'}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {chain.kind === 'evm' && (
                <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={notifyReceiptError} />
            )}
        </>
    );
};

export default RenamePanel;
