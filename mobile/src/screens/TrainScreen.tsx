import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useChainCapabilities, useFees, useTrainPet } from '@shared/core';

import PetPicker from '../components/PetPicker';
import { usePetPicker } from '../hooks/usePetPicker';
import { useNotifyError } from '../hooks/useNotifyError';
import { useTxErrorToast } from '../hooks/useTxErrorToast';
import ActionScreenLayout from './parts/ActionScreenLayout';
import { neon } from '../theme/neon';

export default function TrainScreen() {
    const { isConnected } = useChainCapabilities();
    const picker = usePetPicker();
    const notifyError = useNotifyError();
    const fees = useFees();
    const [success, setSuccess] = useState<string | null>(null);

    const { mutate, isPending, error, reset } = useTrainPet({
        onSuccess: () => {
            setSuccess('Pet trained successfully!');
            picker.clear();
            picker.refetch();
        },
    });

    useTxErrorToast(error);

    const selectedLevel = picker.selectedPet?.level;

    // Train fee is level-scaled: baseFee × (100 + 2·level) / 100.
    const trainCost = useMemo(() => {
        if (selectedLevel == null || fees.trainFee == null) return null;
        return fees.formatAmount((fees.trainFee * BigInt(100 + 2 * selectedLevel)) / 100n);
    }, [fees, selectedLevel]);

    const handleTrain = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'train-validation');
            return;
        }
        if (!picker.selectedId) {
            notifyError('Please select a pet to train', undefined, 'train-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: picker.selectedId });
        } catch (err) {
            console.error('[train]', err);
        }
    };

    return (
        <ActionScreenLayout
            title="Training Ground"
            subtitle="Pay a level-scaled fee for an instant XP boost."
            success={success}
            actionLabel={isPending ? 'Training…' : trainCost ? `Train (${trainCost})` : 'Train'}
            onAction={handleTrain}
            actionDisabled={isPending || !picker.selectedId || !isConnected}
        >
            <PetPicker
                pets={picker.selectable}
                selectedId={picker.selectedId}
                onSelect={picker.select}
                disabled={isPending}
                emptyHint="No pets are off cooldown right now."
            />
            {picker.selectedPet ? (
                <View style={styles.detail}>
                    <Text style={styles.detailText}>
                        {picker.selectedPet.name} · Level {picker.selectedPet.level}
                        {picker.selectedPet.xp != null ? ` · ${picker.selectedPet.xp} XP` : ''}
                    </Text>
                </View>
            ) : null}
        </ActionScreenLayout>
    );
}

const styles = StyleSheet.create({
    detail: {
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
    },
    detailText: {
        color: neon.text,
        fontSize: 15,
        fontWeight: '600',
    },
});
