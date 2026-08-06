import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import CreatePetModal from '../components/CreatePetModal';
import PetList from '../components/PetList';
import SendPetModal from '../components/SendPetModal';
import { usePetGallery } from '../hooks/pet-gallery/usePetGallery';
import { neon, neonGlow } from '../theme/neon';

/**
 * The player's collection: a pure view over `usePetGallery`, same split frontend
 * uses between `pet-gallery/index.tsx` and its hook.
 *
 * Frontend's stat strip has a third tile, Global Rank, backed by placeholder data.
 * It is left out rather than reproduced: a hardcoded "#3" reads as real on a phone
 * with no surrounding context.
 */
export default function GalleryScreen() {
    const {
        pets,
        isLoading,
        error,
        totalWins,
        statusFor,
        refreshing,
        onRefresh,
        createPet,
        createModalOpen,
        onOpenCreateModal,
        onCloseCreateModal,
        onBattle,
        onRename,
        onDefend,
        sendingPet,
        onSend,
        onCloseSend,
        onSent,
    } = usePetGallery();

    return (
        // No outer ScrollView: PetList brings its own scroll and pull-to-refresh.
        <View style={styles.root}>
            <View style={styles.stats}>
                <View style={[styles.stat, styles.statCyan]}>
                    <Text style={styles.statValue}>{pets.length}</Text>
                    <Text style={styles.statLabel}>Pets</Text>
                </View>
                <View style={[styles.stat, styles.statViolet]}>
                    <Text style={styles.statValue}>{totalWins}</Text>
                    <Text style={styles.statLabel}>Wins</Text>
                </View>
            </View>

            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={styles.createBtn}
                    onPress={onOpenCreateModal}
                    activeOpacity={0.85}
                >
                    <Text style={styles.createBtnText}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
                    onPress={onRefresh}
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
                visible={createModalOpen}
                onClose={onCloseCreateModal}
                createPet={createPet}
            />

            <PetList
                pets={pets}
                isLoading={isLoading}
                error={error}
                onRefresh={onRefresh}
                refreshing={refreshing}
                statusFor={statusFor}
                onBattle={onBattle}
                onRename={onRename}
                onDefend={onDefend}
                onSend={onSend}
            />

            <SendPetModal pet={sendingPet} onClose={onCloseSend} onSent={onSent} />
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
    stats: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    stat: {
        flex: 1,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        borderWidth: 1,
        paddingVertical: 12,
        alignItems: 'center',
        marginRight: 12,
    },
    statCyan: {
        borderColor: 'rgba(0, 245, 255, 0.35)',
        ...neonGlow(neon.cyan, 8, 0.2),
    },
    statViolet: {
        borderColor: 'rgba(192, 132, 252, 0.35)',
        marginRight: 0,
        ...neonGlow(neon.purple, 8, 0.2),
    },
    statValue: {
        fontSize: 22,
        fontWeight: '900',
        color: neon.text,
    },
    statLabel: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
        letterSpacing: 1,
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
