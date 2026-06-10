import React, { useState } from 'react';
import {
    useChainCapabilities,
    useCreatePet,
    usePetList,
} from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, PawIcon } from '@components/ui/icon';
import TransactionStatus from '@components/common/transaction-status';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import './index.css';

const PetCreator: React.FC = () => {
    const { isConnected } = useChainCapabilities();
    const { refetch } = usePetList();
    const notifyError = useNotifyError();

    const [petName, setPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleCreateComplete = () => {
        setSuccess(`Pet "${petName.trim()}" created successfully!`);
        setPetName('');
        refetch();
    };

    const { mutate, isPending, error: hookError, lifecycle } = useCreatePet({
        onSuccess: handleCreateComplete,
    });

    useTxErrorToast(hookError);

    const handleCreatePet = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'create-pet-validation');
            return;
        }

        const trimmed = petName.trim();
        if (!trimmed) {
            notifyError('Please enter a pet name', undefined, 'create-pet-validation');
            return;
        }

        setSuccess(null);

        try {
            await mutate({ name: trimmed });
        } catch (err) {
            console.error('[create-pet]', err);
        }
    };

    if (!isConnected) {
        return (
            <div className="pet-creator">
                <div className="card">
                    <h3><Icon as={PawIcon} tone={Tones.Cyan} />Create Your First Pet</h3>
                    <p>Connect your wallet to start creating pets!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pet-creator">
            <div className="card">
                <h3><Icon as={PawIcon} tone={Tones.Cyan} />Create Your First Pet</h3>
                <p>Give your pet a unique name and bring it to life! You can only create one pet initially — breed to grow your collection!</p>

                <div className="form">
                    <div className="field">
                        <label htmlFor="petNameCreator">Pet Name</label>
                        <input
                            id="petNameCreator"
                            type="text"
                            value={petName}
                            onChange={(e) => setPetName(e.target.value)}
                            placeholder="Enter pet name..."
                            maxLength={20}
                            disabled={isPending}
                        />
                    </div>

                    <button
                        onClick={handleCreatePet}
                        disabled={isPending || !petName.trim()}
                        className="submit"
                    >
                        {isPending ? 'Creating...' : 'Create Pet'}
                    </button>
                </div>

                {success && (
                    <div className="success-message">
                        <Icon as={CheckIcon} tone={Tones.Emerald} />
                        {success}
                    </div>
                )}

                <TransactionStatus lifecycle={lifecycle} />
            </div>
        </div>
    );
};

export default PetCreator;
