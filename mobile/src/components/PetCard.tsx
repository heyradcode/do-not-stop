import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getRarityColor, getRarityName, type Pet } from '@shared/core';

import type { PetCooldownStatus } from '../hooks/usePetCooldowns';
import { neon, neonGlow } from '../theme/neon';

type Props = {
    pet: Pet;
    status: PetCooldownStatus;
    onBattle: () => void;
    onRename: () => void;
    onDefend: () => void;
};

/**
 * One pet, with its cooldowns and the per-pet actions that reach the stack routes.
 * Rename and Defense live here rather than in the tab bar because both act on a
 * chosen pet; see plan 3.1.
 */
export default function PetCard({ pet, status, onBattle, onRename, onDefend }: Props) {
    const rarityColor = getRarityColor(pet.rarity);

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.petName}>{pet.name}</Text>
                <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                    <Text style={[styles.rarityText, { color: rarityColor }]}>
                        {getRarityName(pet.rarity)}
                    </Text>
                </View>
            </View>

            <Text style={styles.meta}>ID #{pet.id}</Text>
            <Text style={styles.meta}>
                Level {pet.level}
                {pet.xp != null ? ` · ${pet.xp} XP` : ''}
            </Text>
            <Text style={styles.meta}>
                W {pet.winCount} · L {pet.lossCount}
            </Text>

            {status.onCooldown ? (
                <View style={styles.cooldowns}>
                    {status.battleOnCooldown && (
                        <Text style={styles.cooldown}>Battle ready in {status.battleLabel}</Text>
                    )}
                    {status.breedOnCooldown && (
                        <Text style={styles.cooldown}>Breed ready in {status.breedLabel}</Text>
                    )}
                    {status.trainOnCooldown && (
                        <Text style={styles.cooldown}>Train ready in {status.trainLabel}</Text>
                    )}
                </View>
            ) : null}

            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.action, styles.battleAction, !status.battleReady && styles.actionDisabled]}
                    onPress={onBattle}
                    disabled={!status.battleReady}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.actionText, { color: neon.magenta }]}>Battle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={onRename} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Rename</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={onDefend} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Defend</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
    cooldowns: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 45, 166, 0.2)',
    },
    cooldown: {
        fontSize: 13,
        color: neon.textDim,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        marginTop: 12,
        flexWrap: 'wrap',
    },
    action: {
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgPanel,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginRight: 8,
        marginTop: 4,
    },
    battleAction: {
        borderColor: neon.borderMagenta,
    },
    actionDisabled: {
        opacity: 0.4,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '700',
        color: neon.cyan,
    },
});
