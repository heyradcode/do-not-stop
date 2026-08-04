import React from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { Pet } from '@shared/core';
import { neon, neonGlow } from '../theme/neon';
import PetArt from './PetArt';

type Props = {
    pets: Pet[];
    petIds: bigint[];
    isLoading: boolean;
    contractError: Error | null | undefined;
    isContractConfigured: boolean;
    onRefresh: () => void;
    refreshing: boolean;
    getRarityName: (rarity: number) => string;
    getRarityColor: (rarity: number) => string;
};

export default function PetList({
    pets,
    petIds,
    isLoading,
    contractError,
    isContractConfigured,
    onRefresh,
    refreshing,
    getRarityName,
    getRarityColor,
}: Props) {
    if (!isContractConfigured) {
        return (
            <View style={styles.centered}>
                <Text style={styles.hintTitle}>Contract not configured</Text>
                <Text style={styles.hintBody}>
                    Set CONTRACT_ADDRESS in your mobile `.env` to match the deployed CryptoPets address (same as
                    frontend `VITE_CONTRACT_ADDRESS`), then restart Metro.
                </Text>
            </View>
        );
    }

    if (contractError) {
        const message =
            contractError instanceof Error ? contractError.message : String(contractError);
        return (
            <View style={styles.centered}>
                <Text style={styles.errorTitle}>Could not load pets</Text>
                <Text style={styles.errorBody}>{message}</Text>
                <Text style={styles.hintBody}>
                    Check that your wallet network matches the contract (e.g. Hardhat Local for local deploy).
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

    return (
        <ScrollView
            style={styles.list}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={neon.cyan}
                    colors={[neon.cyan]}
                />
            }
        >
            <Text style={styles.sectionTitle}>Your pets</Text>
            {pets.map((pet, index) => {
                const id = petIds[index];
                const rarityColor = getRarityColor(pet.rarity);
                return (
                    <View key={id !== undefined ? id.toString() : `pet-${index}`} style={styles.card}>
                        <View style={styles.cardHeader}>
                            {/*
                              * Addressed from petIds, not pet.id: these pets come
                              * straight off the EVM PetCore read, whose tuple carries
                              * no id or chain of its own. The id lives alongside in
                              * petIds, and this screen is EVM-only, so both are known
                              * here even though the pet object does not carry them.
                              */}
                            <PetArt
                                pet={{ id: id?.toString() ?? '', chain: 'evm', dna: pet.dna }}
                            />
                            <Text style={styles.petName}>{pet.name}</Text>
                            <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                                <Text style={[styles.rarityText, { color: rarityColor }]}>
                                    {getRarityName(pet.rarity)}
                                </Text>
                            </View>
                        </View>
                        {id !== undefined && <Text style={styles.meta}>ID #{id.toString()}</Text>}
                        <Text style={styles.meta}>Level {pet.level}</Text>
                        <Text style={styles.meta}>
                            W {pet.winCount} · L {pet.lossCount}
                        </Text>
                    </View>
                );
            })}
        </ScrollView>
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
    card: {
        backgroundColor: neon.bgCard,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.22)',
        width: '100%',
        ...neonGlow(neon.cyan, 8, 0.2),
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    petName: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.text,
        flex: 1,
        marginLeft: 10,
    },
    rarityBadge: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    rarityText: {
        fontSize: 12,
        fontWeight: '600',
    },
    meta: {
        fontSize: 14,
        color: neon.textMuted,
        marginTop: 4,
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
