import React, { useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import {
    getPetAvatar,
    getPetClass,
    getReadyPetsUnified,
    useChainCapabilities,
    usePetList,
    useRenamePet,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon, QuillIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import PetShowcase from '../_shared/pet-showcase';
import './index.css';

const MAX_NAME_LEN = 20;

export type RenamePanelProps = {
    isStandaloneView?: boolean;
};

const RenamePanel: React.FC<RenamePanelProps> = ({ isStandaloneView = true }) => {
    const { renameMinLevel, isConnected } = useChainCapabilities();
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

    const {
        mutate,
        isPending,
        error: hookError,
        reset,
        lifecycle,
    } = useRenamePet({
        onSuccess: handleRenameComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);

    useTxErrorToast(hookError);

    const selectablePets = useMemo(
        () =>
            renameMinLevel > 1
                ? readyPets.filter(({ pet }) => pet.level >= renameMinLevel)
                : readyPets,
        [readyPets, renameMinLevel],
    );

    const selectedPetObj = selectablePets.find(({ id }) => id === selectedPet)?.pet ?? null;
    const previewName = newName.trim() || selectedPetObj?.name || 'New Name';
    const meetsMin = newName.trim().length >= 2;

    const handleChangeName = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'rename-validation');
            return;
        }
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
                        <h4>
                            <Icon as={QuillIcon} tone={Tones.Cyan} />
                            Change Pet Name
                        </h4>
                        <p>
                            {renameMinLevel > 1
                                ? `Change your pet's name (requires level ${renameMinLevel}+)`
                                : "Change your pet's name"}
                        </p>
                    </>
                )}

                {selectedPetObj && (
                    <PetShowcase avatar={getPetAvatar(selectedPetObj.dna)} accent="cyan">
                        <div className="rename-preview">{previewName}</div>
                        <div className="rename-sub">
                            {getPetClass(selectedPetObj.dna)} · Lv.{selectedPetObj.level}
                        </div>
                        <div className="rename-reqs">
                            <div className={meetsMin ? 'is-ok' : 'is-pending'}>
                                {meetsMin ? '✓' : '○'} Min 2 characters
                            </div>
                            <div className="is-ok">
                                ✓ Max {MAX_NAME_LEN} characters ({newName.length})
                            </div>
                        </div>
                    </PetShowcase>
                )}

                <div className="picker">
                    <div className="field">
                        <label htmlFor="rename-pet">Select Pet</label>
                        <select
                            id="rename-pet"
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
                        <label htmlFor="rename-new-name">New Name</label>
                        <input
                            id="rename-new-name"
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Enter new name..."
                            maxLength={MAX_NAME_LEN}
                        />
                    </div>
                </div>

                <div className="action-controls">
                    <NeonButton
                        tone="emerald"
                        onClick={handleChangeName}
                        disabled={isPending || !selectedPet || !newName.trim() || !isConnected}
                    >
                        {isPending ? 'Changing Name...' : 'Change Name'}
                    </NeonButton>
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
