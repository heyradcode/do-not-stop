import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
    getGeneration,
    getLifePercent,
    getPetClass,
    getPetSkill,
    getRarityColor,
    getRarityName,
    getXpNumbers,
    type Pet,
} from '@shared/core';

import { statTiles, winPercent } from '../utils/petStats';
import { neon } from '../theme/neon';

/**
 * What you just picked, in three lines under the picker.
 *
 * The chips carry art, a name and a level, which is enough to tell two pets apart and not
 * enough to decide between twenty. Everywhere outside the Gallery a pet is chosen from those
 * chips and then acted on, so until now the screen never showed the numbers the choice
 * actually turns on.
 *
 * Deliberately not `PetCard`. That is roughly 400px, and `BreedScreen` picks two parents, so
 * the card twice over would push the name field and the action bar off a phone. The full card
 * is still one long press away for a pet you are only considering.
 *
 * Every number comes from the same `@shared/core` helper the card and the web app read, so a
 * pet cannot read one way here and another way one screen over.
 */
export default function PetDetailStrip({ pet }: { pet: Pet }) {
    const xp = getXpNumbers(pet);
    const skill = getPetSkill(pet.speciesId);
    const rarityColor = getRarityColor(pet.rarity);

    return (
        <View style={[styles.strip, { borderLeftColor: rarityColor }]}>
            <View style={styles.head}>
                <Text style={styles.name} numberOfLines={1}>
                    {pet.name}
                </Text>
                <Text style={[styles.rarity, { color: rarityColor }]}>
                    {getRarityName(pet.rarity)}
                </Text>
            </View>

            <Text style={styles.lineage} numberOfLines={1}>
                {getPetClass(pet.dna)} · Gen {pet.generation ?? getGeneration(pet.dna)}
                {skill ? ` · ${skill.name}` : ''}
            </Text>

            <View style={styles.stats}>
                {statTiles(pet).map((tile) => (
                    <View key={tile.label} style={styles.stat}>
                        <Text style={styles.statLabel}>{tile.label}</Text>
                        <Text style={styles.statValue}>{tile.value}</Text>
                    </View>
                ))}
            </View>

            <Text style={styles.record} numberOfLines={1}>
                XP {xp.xpCurrent}/{xp.xpMax} · HP {getLifePercent(pet)}% ·{' '}
                <Text style={styles.wins}>{pet.winCount}W</Text>
                {' / '}
                <Text style={styles.losses}>{pet.lossCount}L</Text>
                {winPercent(pet) != null ? ` · ${winPercent(pet)}% wins` : ''}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    strip: {
        backgroundColor: neon.bgPanel,
        borderWidth: 1,
        borderColor: neon.border,
        // The pet's rarity, as a stripe down the side. `PetCard` runs the same colour across
        // its top, so the two read as the same pet rather than as two unrelated panels.
        borderLeftWidth: 3,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
    },
    head: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    name: {
        flex: 1,
        fontSize: 16,
        fontWeight: '800',
        color: neon.text,
    },
    rarity: {
        fontSize: 12,
        fontWeight: '700',
        marginLeft: 8,
    },
    lineage: {
        fontSize: 12,
        fontWeight: '700',
        color: neon.purple,
        marginTop: 2,
    },
    stats: {
        flexDirection: 'row',
        marginTop: 8,
    },
    stat: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: neon.bgCard,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: neon.border,
        paddingVertical: 4,
        marginRight: 6,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        color: neon.textDim,
    },
    statValue: {
        fontSize: 14,
        fontWeight: '800',
        color: neon.cyan,
    },
    record: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 8,
    },
    wins: {
        color: neon.success,
        fontWeight: '800',
    },
    losses: {
        color: neon.danger,
        fontWeight: '800',
    },
});
