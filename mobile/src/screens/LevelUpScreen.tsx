import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useChainCapabilities, useFees, useLevelUpPet } from '@shared/core';

import PetPicker from '../components/PetPicker';
import { usePetPicker } from '../hooks/usePetPicker';
import { useNotifyError } from '../hooks/useNotifyError';
import { useTxErrorToast } from '../hooks/useTxErrorToast';
import ActionScreenLayout from './parts/ActionScreenLayout';
import { neon } from '../theme/neon';

export default function LevelUpScreen() {
    const { isConnected } = useChainCapabilities();
    const picker = usePetPicker();
    const notifyError = useNotifyError();
    const fees = useFees();
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const { mutate, isPending, error, reset } = useLevelUpPet({
        onSuccess: () => {
            setSuccess('Pet leveled up successfully!');
            picker.clear();
            picker.refetch();
        },
    });

    useTxErrorToast(error);

    const selectedLevel = picker.selectedPet?.level;

    // Level-up fee is level-scaled: baseFee × (100 + (level-1)²) / 100.
    const levelUpCost = useMemo(() => {
        if (selectedLevel == null || fees.levelUpFee == null) return null;
        const diff = BigInt(Math.max(selectedLevel - 1, 0));
        return fees.formatAmount((fees.levelUpFee * (100n + diff * diff)) / 100n);
    }, [fees, selectedLevel]);

    const handleLevelUp = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'level-up-validation');
            return;
        }
        if (!picker.selectedId) {
            notifyError('Please select a pet to level up', undefined, 'level-up-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: picker.selectedId });
        } catch (err) {
            console.error('[level-up]', err);
        }
    };

    return (
        <ActionScreenLayout
            title="Level Up"
            subtitle="Pay a level-scaled fee to level up your pet."
            success={success}
            actionLabel={
                isPending ? 'Leveling Up…' : levelUpCost ? `Level Up (${levelUpCost})` : 'Level Up'
            }
            onAction={handleLevelUp}
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
