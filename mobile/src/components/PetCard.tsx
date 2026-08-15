import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    getGeneration,
    getLifePercent,
    getPetClass,
    getPetProperties,
    getPetSkill,
    getRarityColor,
    getRarityName,
    getXpNumbers,
    getXpPercent,
    type EquippedItem,
    type Pet,
} from '@shared/core';

import EquippedBadges from './EquippedBadges';
import PetArt from './PetArt';
import type { PetCooldownStatus } from '../hooks/usePetCooldowns';
import { neon, neonGlow } from '../theme/neon';

/**
 * The four tiles frontend's card shows, from the same helper.
 *
 * The fourth is VIT, not AGI. Agility has no backing in the data model — `getPetProperties`
 * returns life, attack, defense and intelligence and nothing else — and frontend's own
 * comment records the same substitution. Inventing an AGI number here would make the two
 * clients disagree about a stat neither can source.
 */
const statTiles = (pet: Pet): { label: string; value: number }[] => {
    const p = getPetProperties(pet);
    return [
        { label: 'STR', value: p.attack },
        { label: 'INT', value: p.intelligence },
        { label: 'DEF', value: p.defense },
        { label: 'VIT', value: p.life },
    ];
};

const winRatio = (pet: Pet): number => {
    const fought = pet.winCount + pet.lossCount;
    return fought === 0 ? 0 : Math.round((pet.winCount / fought) * 100);
};

/**
 * The five per-pet actions, together or not at all.
 *
 * One optional object rather than five optional handlers, because there is no such thing as
 * a card with three of them: either it is the Gallery's card, which acts on the pet, or it is
 * a read-only look at one, which `PetPreview` shows when a picker chip is held down.
 */
export type PetCardActions = {
    onBattle: () => void;
    onRename: () => void;
    onDefend: () => void;
    onEquip: () => void;
    onSend: () => void;
};

type Props = {
    pet: Pet;
    /** Absent on a read-only card: nothing there is waiting on a cooldown to be usable. */
    status?: PetCooldownStatus;
    /** Filled slots, or undefined for a pet wearing nothing. */
    equipped?: EquippedItem[];
    actions?: PetCardActions;
};

/**
 * One pet, with its cooldowns and the per-pet actions that reach the stack routes.
 * Rename and Defense live here rather than in the tab bar because both act on a
 * chosen pet; see plan 3.1.
 *
 * Everything below the name comes from `@shared/core` helpers rather than being derived
 * here, so a pet reads identically on both clients. That was the gap this card had: the
 * app knew its art, stats, skill and class the whole time and drew none of them.
 */
export default function PetCard({ pet, status, equipped, actions }: Props) {
    const rarityColor = getRarityColor(pet.rarity);
    const skill = getPetSkill(pet.speciesId);
    const xp = getXpNumbers(pet);
    const hp = getLifePercent(pet);

    return (
        <View style={styles.card}>
            {/* A rarity stripe across the top, as on web: the card's colour is the pet's. */}
            <View style={[styles.rarityBar, { backgroundColor: rarityColor }]} />

            <View style={styles.cardHeader}>
                <PetArt pet={pet} size={64} />
                <View style={styles.identity}>
                    <Text style={styles.petName} numberOfLines={1}>
                        {pet.name}
                    </Text>
                    <Text style={styles.petClass} numberOfLines={1}>
                        {getPetClass(pet.dna)} · Gen {pet.generation ?? getGeneration(pet.dna)}
                    </Text>
                    <Text style={styles.meta}>
                        ID #{pet.id} · Level {pet.level}
                    </Text>
                </View>
                <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                    <Text style={[styles.rarityText, { color: rarityColor }]}>
                        {getRarityName(pet.rarity)}
                    </Text>
                </View>
            </View>

            <EquippedBadges equipped={equipped} rarity={pet.rarity} />

            {skill ? (
                <View style={styles.skill}>
                    <Text style={styles.skillName}>{skill.name}</Text>
                    <Text style={styles.skillText} numberOfLines={2}>
                        {skill.description}
                    </Text>
                </View>
            ) : null}

            <View style={styles.stats}>
                {statTiles(pet).map((tile) => (
                    <View key={tile.label} style={styles.stat}>
                        <Text style={styles.statLabel}>{tile.label}</Text>
                        <Text style={styles.statValue}>{tile.value}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.barRow}>
                <Text style={styles.barLabel}>XP</Text>
                <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${getXpPercent(pet)}%` }]} />
                </View>
                <Text style={styles.barValue}>
                    {xp.xpCurrent}/{xp.xpMax}
                </Text>
            </View>

            <View style={styles.barRow}>
                <Text style={styles.barLabel}>HP</Text>
                <View style={styles.barTrack}>
                    <View
                        style={[styles.barFill, styles.hpFill, { width: `${hp}%` }]}
                    />
                </View>
                <Text style={styles.barValue}>{hp}%</Text>
            </View>

            <Text style={styles.meta}>
                <Text style={styles.wins}>{pet.winCount}W</Text>
                {' / '}
                <Text style={styles.losses}>{pet.lossCount}L</Text>
                {pet.winCount + pet.lossCount > 0 ? `  ·  ${winRatio(pet)}% win rate` : ''}
            </Text>

            {status?.onCooldown ? (
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

            {actions ? (
            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.action, styles.battleAction, !status?.battleReady && styles.actionDisabled]}
                    onPress={actions.onBattle}
                    disabled={!status?.battleReady}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.actionText, { color: neon.magenta }]}>Battle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={actions.onRename} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Rename</Text>
                </TouchableOpacity>
                {/*
                 * "Allow" rather than "Defend": the screen this opens grants standing
                 * consent to be challenged, and "Defend" reads as an action taken during
                 * a fight. Shortened from the screen's own "Allow Challenges" only
                 * because five buttons share this row.
                 */}
                <TouchableOpacity
                    style={styles.action}
                    onPress={actions.onDefend}
                    accessibilityRole="button"
                    accessibilityLabel="Allow challenges for this pet"
                    activeOpacity={0.85}
                >
                    <Text style={styles.actionText}>Allow</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={actions.onEquip} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Equip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={actions.onSend} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Send</Text>
                </TouchableOpacity>
            </View>
            ) : null}
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
    rarityBar: {
        height: 3,
        borderRadius: 2,
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    identity: {
        flex: 1,
        marginLeft: 12,
        minWidth: 0,
    },
    petName: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.text,
    },
    petClass: {
        fontSize: 12,
        color: neon.purple,
        marginTop: 2,
        fontWeight: '700',
    },
    skill: {
        marginTop: 4,
        marginBottom: 10,
        borderLeftWidth: 2,
        borderLeftColor: neon.purple,
        paddingLeft: 10,
    },
    skillName: {
        fontSize: 13,
        fontWeight: '800',
        color: neon.purple,
    },
    skillText: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
        lineHeight: 16,
    },
    stats: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    stat: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: neon.bgPanel,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: neon.border,
        paddingVertical: 8,
        marginRight: 6,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        color: neon.textDim,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '800',
        color: neon.cyan,
        marginTop: 2,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    barLabel: {
        width: 26,
        fontSize: 11,
        fontWeight: '800',
        color: neon.textDim,
    },
    barTrack: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        backgroundColor: neon.bgInput,
        overflow: 'hidden',
        marginHorizontal: 8,
    },
    barFill: {
        height: 6,
        borderRadius: 3,
        backgroundColor: neon.cyan,
    },
    hpFill: {
        backgroundColor: neon.success,
    },
    barValue: {
        minWidth: 62,
        fontSize: 11,
        color: neon.textMuted,
        textAlign: 'right',
    },
    wins: {
        color: neon.success,
        fontWeight: '800',
    },
    losses: {
        color: neon.danger,
        fontWeight: '800',
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
