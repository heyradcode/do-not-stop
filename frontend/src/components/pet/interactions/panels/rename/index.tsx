import React, { useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import { AuthActionButton } from '@components/common';
import {
    getReadyPetsUnified,
    useChainCapabilities,
    usePetList,
    useRenamePet,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon, QuillIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

export type RenamePanelProps = {
    isStandaloneView?: boolean;
};

const RenamePanel: React.FC<RenamePanelProps> = ({ isStandaloneView = true }) => {
    const { renameMinLevel } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [newName, setNewName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleRenameComplete = () => {
        setSuccess(`Pet name changed to "${newName}"!`);
        setSelectedPet('');
        setNewName('');
        refetch();
    };

    const { mutate, isPending, error: hookError, reset, lifecycle } = useRenamePet({
        onSuccess: handleRenameComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);

    useTxErrorToast(hookError);

    const selectablePets = useMemo(
        () => (renameMinLevel > 1 ? readyPets.filter(({ pet }) => pet.level >= renameMinLevel) : readyPets),
        [readyPets, renameMinLevel]
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
        } catch (err) {
            console.error('[rename]', err);
        }
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={QuillIcon} tone={Tones.Cyan} />Change Pet Name</h4>
                        <p>
                            {renameMinLevel > 1
                                ? `Change your pet's name (requires level ${renameMinLevel}+)`
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
                    <AuthActionButton onClick={handleChangeName} disabled={isPending || !selectedPet || !newName.trim()}>
                        {isPending ? 'Changing Name...' : 'Change Name'}
                    </AuthActionButton>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            <TransactionStatus lifecycle={lifecycle} />
        </>
    );
};

export default RenamePanel;
