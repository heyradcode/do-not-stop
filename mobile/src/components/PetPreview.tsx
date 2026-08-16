import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { Pet } from '@shared/core';

import PetCard from './PetCard';
import { alpha, neon } from '../theme/neon';

/**
 * A read-only look at one pet, for the screens that are not the Gallery.
 *
 * Everywhere else a pet is a chip: art, a name and a level. That is enough to choose between
 * two pets you already know and not enough to choose between twenty, so holding a chip down
 * brings up the card the Gallery would have shown.
 *
 * No actions on it. The card's five buttons all navigate, and this opens from the middle of
 * something else: picking a breeding parent, setting up a battle. Sending the player to the
 * Rename screen from there loses whatever they had half-filled in. `PetCard` renders no
 * action row when it is given no actions, which is why this needs nothing else.
 *
 * Dismissed by tapping anywhere, including the card. There is nothing on it to press, so a
 * close button would be the only target and the rest of the surface would look inert.
 */
export default function PetPreview({ pet, onClose }: { pet: Pet | null; onClose: () => void }) {
    return (
        <Modal visible={pet != null} transparent animationType="fade" onRequestClose={onClose}>
            {/*
             * RN's own fade rather than `usePanelTransition`, which the sheet and the drawer
             * use. Those come from an edge and have to be driven by hand to do it; this one
             * has no direction to come from, and the open state lives in the picker rather
             * than in here, which is the half that hook owns.
             */}
            <Pressable style={styles.root} onPress={onClose} accessibilityLabel="Close pet card">
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                >
                    {/* The card can outgrow a short screen, and it has no actions to reach,
                        so it scrolls rather than being cut off. */}
                    {pet ? <PetCard pet={pet} /> : null}
                </ScrollView>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: alpha(neon.bgDeep, 0.88),
        justifyContent: 'center',
    },
    scroll: {
        flexGrow: 0,
    },
    content: {
        paddingHorizontal: 20,
        paddingVertical: 24,
    },
});
