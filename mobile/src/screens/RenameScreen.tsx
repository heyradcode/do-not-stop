import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { useChainCapabilities, useRenamePet, type Pet } from '@shared/core';

import PetPicker from '../components/PetPicker';
import { usePetPicker } from '../hooks/usePetPicker';
import { useNotifyError } from '../hooks/useNotifyError';
import { useTxErrorToast } from '../hooks/useTxErrorToast';
import type { RootStackParamList } from '../navigation/routes';
import ActionScreenLayout from './parts/ActionScreenLayout';
import { neon } from '../theme/neon';

const MAX_NAME_LEN = 20;
const MIN_NAME_LEN = 2;

export default function RenameScreen() {
    const { params } = useRoute<RouteProp<RootStackParamList, 'Rename'>>();
    const { renameMinLevel, isConnected } = useChainCapabilities();
    const notifyError = useNotifyError();

    // Some chains gate renaming behind a level; frontend filters the same way.
    const levelFilter = useCallback(
        (pet: Pet) => renameMinLevel <= 1 || pet.level >= renameMinLevel,
        [renameMinLevel],
    );
    const picker = usePetPicker(levelFilter);
    const { select } = picker;

    const [newName, setNewName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    // Arrives from a Gallery card's Rename action, so the pet is already chosen.
    const petIdParam = params?.petId;
    useEffect(() => {
        if (petIdParam) select(petIdParam);
    }, [petIdParam, select]);

    const { mutate, isPending, error, reset } = useRenamePet({
        onSuccess: () => {
            setSuccess(`Pet name changed to "${newName.trim()}"!`);
            picker.clear();
            setNewName('');
            picker.refetch();
        },
    });

    useTxErrorToast(error);

    const trimmed = newName.trim();
    const meetsMin = trimmed.length >= MIN_NAME_LEN;

    const handleRename = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'rename-validation');
            return;
        }
        if (!picker.selectedId || !trimmed) {
            notifyError(
                'Please select a pet and enter a new name',
                undefined,
                'rename-validation',
            );
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: picker.selectedId, name: trimmed });
        } catch (err) {
            console.error('[rename]', err);
        }
    };

    return (
        <ActionScreenLayout
            title="Rename Pet"
            subtitle={
                renameMinLevel > 1
                    ? `Change your pet's name (requires level ${renameMinLevel}+).`
                    : "Change your pet's name."
            }
            success={success}
            actionLabel={isPending ? 'Changing Name…' : 'Change Name'}
            onAction={handleRename}
            actionDisabled={isPending || !picker.selectedId || !meetsMin || !isConnected}
        >
            <PetPicker
                pets={picker.selectable}
                selectedId={picker.selectedId}
                onSelect={picker.select}
                disabled={isPending}
                emptyHint={
                    renameMinLevel > 1
                        ? `No pets are off cooldown and at level ${renameMinLevel} or above.`
                        : 'No pets are off cooldown right now.'
                }
            />

            <Text style={styles.label}>New Name</Text>
            <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter new name…"
                placeholderTextColor={neon.textDim}
                maxLength={MAX_NAME_LEN}
                editable={!isPending}
                autoCapitalize="words"
                autoCorrect={false}
            />

            {picker.selectedPet ? (
                <View style={styles.preview}>
                    <Text style={styles.previewName}>{trimmed || picker.selectedPet.name}</Text>
                    <Text style={[styles.req, meetsMin ? styles.reqOk : styles.reqPending]}>
                        {meetsMin ? '✓' : '○'} Min {MIN_NAME_LEN} characters
                    </Text>
                    <Text style={[styles.req, styles.reqOk]}>
                        ✓ Max {MAX_NAME_LEN} characters ({newName.length})
                    </Text>
                </View>
            ) : null}
        </ActionScreenLayout>
    );
}

const styles = StyleSheet.create({
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textMuted,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.35)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: neon.text,
        backgroundColor: neon.bgInput,
    },
    preview: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
    },
    previewName: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.cyan,
        marginBottom: 8,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
    },
    req: {
        fontSize: 13,
        marginTop: 2,
    },
    reqOk: {
        color: neon.success,
    },
    reqPending: {
        color: neon.textDim,
    },
});
