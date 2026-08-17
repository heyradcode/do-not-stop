import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { IMAGE_SERVICE_URL } from '@env';
import { itemArtUrl, itemFallbackArtUrl, type ItemDefinition } from '@shared/core';

type Props = {
    item: Pick<ItemDefinition, 'itemType' | 'name'>;
    /** Square edge in px. Tile size in the bag; larger where an item is the subject. */
    size?: number;
};

/**
 * An item's art, degrading in two steps rather than one.
 *
 * Unlike a pet — which falls straight back to its emoji avatar — an item has a real
 * intermediate. The service draws a deterministic SVG from the catalog entry alone, needing
 * no model, no store and no credentials, so the painted PNG is tried first and anything that
 * stops it arriving falls through to art that is merely plainer instead of to a hole.
 *
 * Only an unconfigured service renders nothing, which is the "art is optional" state the
 * whole image service is built around: leave `IMAGE_SERVICE_URL` unset and the app keeps
 * working, minus pictures.
 *
 * No retry timer, unlike `PetArt`. That one needs one because its only fallback is an emoji
 * and a cold pet's art lands seconds later; here the second attempt is a different URL that
 * is always ready, so there is nothing to wait for.
 *
 * The route shapes live in `@shared/core`, so both clients address items identically and
 * only the environment read differs.
 */
export default function ItemArt({ item, size = 40 }: Props) {
    const [stage, setStage] = useState<'painted' | 'drawn' | 'none'>('painted');

    const painted = itemArtUrl(item.itemType, IMAGE_SERVICE_URL);
    const drawn = itemFallbackArtUrl(item.itemType, IMAGE_SERVICE_URL);

    // No service configured: nothing is coming, so the caller is left exactly as it was
    // before art existed rather than holding an empty box.
    if (!painted) return null;

    const uri = stage === 'painted' ? painted : stage === 'drawn' ? drawn : null;
    if (!uri) return null;

    return (
        <View style={[styles.frame, { width: size, height: size }]}>
            <Image
                // Remounts on the fallback: reusing the element with a changed uri is fine,
                // but keying it makes the two attempts independent rather than one element
                // that has already reported failure.
                key={stage}
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setStage(stage === 'painted' ? 'drawn' : 'none')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
});
