import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCreatePet, usePetList } from '@shared/core';

import CreatePetModal from '../components/CreatePetModal';
import PetList from '../components/PetList';
import { neon, neonGlow } from '../theme/neon';

/**
 * The player's collection. Carried over from the pre-navigation `AppContent`, so
 * it is already on `usePetList` / `useCreatePet`; Phase 4 adds the cooldown and
 * per-pet action surface frontend's pet-gallery has.
 */
export default function GalleryScreen() {
    const pets = usePetList();
    const [refreshing, setRefreshing] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);

    const closeCreateModal = useCallback(() => {
        setCreateModalVisible(false);
    }, []);

    // EVM minting is two-phase (requestMintStarter, then settleMint once Pyth
    // Entropy reveals), so the list is only worth re-reading once onSuccess fires.
    const createPet = useCreatePet({
        onSuccess: () => {
            closeCreateModal();
            pets.refetch();
        },
    });

    const handleRefreshPets = useCallback(async () => {
        setRefreshing(true);
        try {
            await pets.refetch();
        } finally {
            setRefreshing(false);
        }
    }, [pets]);

    return (
        // No outer ScrollView: PetList brings its own scroll and pull-to-refresh.
        <View style={styles.root}>
            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={styles.createBtn}
                    onPress={() => setCreateModalVisible(true)}
                    activeOpacity={0.85}
                >
                    <Text style={styles.createBtnText}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
                    onPress={handleRefreshPets}
                    disabled={refreshing}
                    activeOpacity={0.85}
                >
                    {refreshing ? (
                        <ActivityIndicator size="small" color={neon.cyan} />
                    ) : (
                        <Text style={styles.refreshBtnText}>Refresh</Text>
                    )}
                </TouchableOpacity>
            </View>
            <CreatePetModal
                visible={createModalVisible}
                onClose={closeCreateModal}
                createPet={createPet}
            />
            <PetList
                pets={pets.pets}
                isLoading={pets.isLoading}
                error={pets.error}
                onRefresh={handleRefreshPets}
                refreshing={refreshing}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
    },
    createBtn: {
        backgroundColor: neon.bgCard,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        marginRight: 12,
        marginBottom: 4,
        minWidth: 100,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    createBtnText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    refreshBtn: {
        borderWidth: 1,
        borderColor: neon.magenta,
        backgroundColor: neon.bgPanel,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 4,
        minWidth: 100,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 42,
        ...neonGlow(neon.magenta, 8, 0.25),
    },
    refreshBtnDisabled: {
        opacity: 0.5,
    },
    refreshBtnText: {
        color: neon.magenta,
        fontSize: 16,
        fontWeight: '700',
    },
});
