import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSearchPets, type OpponentPet, type PetChain } from '@shared/core';

import PetArt from './PetArt';
import { neon } from '../theme/neon';

type Props = {
    chain: PetChain | null;
    /** Selected pet id, owned by the caller. Clearing it resets this field. */
    value: string;
    onChange: (petId: string) => void;
    /** Pet ids to keep out of the results, e.g. the pet the player already picked. */
    excludeIds?: string[];
    placeholder?: string;
    disabled?: boolean;
};

/**
 * Find another player's pet by name or id.
 *
 * The mobile counterpart of frontend's `PetSearchDropdown`, and it exists for the same
 * reason: a marriage proposal names an exact pet, and until now this screen asked the
 * player to type its numeric id from memory. That works only if the two players are
 * already talking somewhere else.
 *
 * Results render inline rather than in an overlay. Frontend portals its dropdown to
 * escape a clipping ancestor, which is a CSS problem React Native does not have, and an
 * absolutely positioned list inside a `ScrollView` would be clipped by it anyway.
 *
 * Plain mapped views rather than a `FlatList`: this is at most ten rows, and a
 * virtualized list nested in a `ScrollView` warns and loses its own scrolling.
 *
 * The 300 ms debounce lives in `useSearchPets`, so typing here costs one request per
 * pause rather than one per keystroke.
 */
export default function PetSearchField({
    chain,
    value,
    onChange,
    excludeIds = [],
    placeholder = 'Search by name or id',
    disabled = false,
}: Props) {
    const [text, setText] = useState('');
    const [selected, setSelected] = useState<OpponentPet | null>(null);

    // The parent clears `value` after a successful proposal, which has to clear the
    // chosen pet here too or the field keeps showing someone it no longer reports.
    useEffect(() => {
        if (!value) {
            setSelected(null);
            setText('');
        }
    }, [value]);

    const { results, isLoading, error } = useSearchPets(text, {
        chain,
        enabled: !disabled && !selected,
    });

    const shown = excludeIds.length
        ? results.filter((pet) => !excludeIds.includes(pet.id))
        : results;

    const choose = (pet: OpponentPet) => {
        setSelected(pet);
        setText('');
        onChange(pet.id);
    };

    const clear = () => {
        setSelected(null);
        onChange('');
    };

    if (selected) {
        return (
            <View style={styles.selected}>
                <PetArt pet={selected} size={36} />
                <View style={styles.selectedBody}>
                    <Text style={styles.selectedName} numberOfLines={1}>
                        {selected.name}
                    </Text>
                    <Text style={styles.selectedSub}>
                        #{selected.id} · Lv {selected.level}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={clear}
                    disabled={disabled}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear selected pet"
                >
                    <Text style={styles.clear}>×</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // A trimmed term is what the hook actually queries on, so the states below have to
    // agree with it or an all-spaces term reads as "no matches" rather than as idle.
    const term = text.trim();

    return (
        <View>
            <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={neon.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!disabled}
                accessibilityLabel={placeholder}
            />

            {error ? <Text style={styles.error}>{error.message}</Text> : null}

            {term.length > 0 && !error ? (
                <View style={styles.results}>
                    {isLoading && shown.length === 0 ? (
                        <View style={styles.status}>
                            <ActivityIndicator size="small" color={neon.cyan} />
                        </View>
                    ) : shown.length === 0 ? (
                        <Text style={styles.status}>No pets match “{term}”.</Text>
                    ) : (
                        shown.map((pet) => (
                            <TouchableOpacity
                                key={pet.id}
                                style={styles.result}
                                onPress={() => choose(pet)}
                                disabled={disabled}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Choose ${pet.name}`}
                            >
                                <PetArt pet={pet} size={32} />
                                <View style={styles.resultBody}>
                                    <Text style={styles.resultName} numberOfLines={1}>
                                        {pet.name}
                                    </Text>
                                    <Text style={styles.resultSub}>
                                        #{pet.id} · Lv {pet.level}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    input: {
        backgroundColor: neon.bgInput,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: neon.text,
    },
    results: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: neon.border,
        borderRadius: 12,
        backgroundColor: neon.bgPanel,
        overflow: 'hidden',
    },
    status: {
        padding: 14,
        fontSize: 13,
        color: neon.textMuted,
        textAlign: 'center',
    },
    result: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: neon.border,
    },
    resultBody: {
        flex: 1,
        marginLeft: 10,
        minWidth: 0,
    },
    resultName: {
        fontSize: 15,
        fontWeight: '700',
        color: neon.text,
    },
    resultSub: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
    },
    selected: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.cyan,
        padding: 10,
    },
    selectedBody: {
        flex: 1,
        marginLeft: 10,
        minWidth: 0,
    },
    selectedName: {
        fontSize: 15,
        fontWeight: '800',
        color: neon.cyan,
    },
    selectedSub: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
    },
    clear: {
        fontSize: 24,
        color: neon.magenta,
        paddingHorizontal: 6,
    },
});
