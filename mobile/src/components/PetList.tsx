import React from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { EquippedItem, Pet } from '@shared/core';

import PetCard from './PetCard';
import Carousel from './ui/Carousel';
import type { PetCooldownStatus } from '../hooks/usePetCooldowns';
import { neon } from '../theme/neon';

type Props = {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    onRefresh: () => void;
    refreshing: boolean;
    statusFor: (pet: Pet) => PetCooldownStatus;
    onBattle: (pet: Pet) => void;
    onRename: (pet: Pet) => void;
    onDefend: (pet: Pet) => void;
    onEquip: (pet: Pet) => void;
    equippedFor: (petId: string) => EquippedItem[] | undefined;
    onSend: (pet: Pet) => void;
};

export default function PetList({
    pets,
    isLoading,
    error,
    onRefresh,
    refreshing,
    statusFor,
    onBattle,
    onRename,
    onDefend,
    onEquip,
    equippedFor,
    onSend,
}: Props) {
    if (error) {
        const message = error instanceof Error ? error.message : String(error);
        return (
            <View style={styles.centered}>
                <Text style={styles.errorTitle}>Could not load pets</Text>
                <Text style={styles.errorBody}>{message}</Text>
                <Text style={styles.hintBody}>
                    Check that your wallet is on the network the contracts are deployed to.
                </Text>
            </View>
        );
    }

    if (isLoading && pets.length === 0) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={neon.cyan} />
                <Text style={styles.loadingText}>Loading your pets…</Text>
            </View>
        );
    }

    if (pets.length === 0) {
        return (
            <ScrollView
                contentContainerStyle={styles.centered}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={neon.cyan}
                        colors={[neon.cyan]}
                    />
                }
            >
                <Text style={styles.emptyTitle}>No pets yet</Text>
                <Text style={styles.hintBody}>
                    Tap Create to mint a pet, or use Refresh / pull down to reload from the chain.
                </Text>
            </ScrollView>
        );
    }

    /*
     * One pet per page, swiped through, rather than a vertical stack.
     *
     * Pull-to-refresh goes with it: `RefreshControl` on a horizontal list is unsupported on
     * Android and awkward on iOS. `GalleryScreen`'s Refresh button already does the same job,
     * so what is lost is the gesture, not the ability. The empty state above keeps its pull,
     * since that branch is still a vertical scroll and is where a reload is most wanted.
     *
     * The heading sits outside the pager. Inside, it would be one per page.
     */
    return (
        <View style={styles.list}>
            <Text style={styles.sectionTitle}>Your pets</Text>
            <Carousel
                data={pets}
                keyExtractor={(pet) => pet.id}
                itemLabel="Pet"
                renderItem={(pet) => (
                    <PetCard
                        pet={pet}
                        status={statusFor(pet)}
                        equipped={equippedFor(pet.id)}
                        actions={{
                            onBattle: () => onBattle(pet),
                            onRename: () => onRename(pet),
                            onDefend: () => onDefend(pet),
                            onEquip: () => onEquip(pet),
                            onSend: () => onSend(pet),
                        }}
                    />
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        flex: 1,
        alignSelf: 'stretch',
        width: '100%',
    },
    centered: {
        paddingVertical: 24,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        marginBottom: 16,
        alignSelf: 'flex-start',
        letterSpacing: 0.5,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: neon.textMuted,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.text,
        marginBottom: 8,
        textShadowColor: neon.magenta,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    hintTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    hintBody: {
        fontSize: 15,
        color: neon.textMuted,
        textAlign: 'center',
        lineHeight: 22,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.danger,
        marginBottom: 8,
        textAlign: 'center',
        textShadowColor: neon.danger,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    errorBody: {
        fontSize: 14,
        color: neon.textMuted,
        textAlign: 'center',
        marginBottom: 8,
    },
});
