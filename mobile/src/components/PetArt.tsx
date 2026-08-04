import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IMAGE_SERVICE_URL } from '@env';
import { getPetAvatar, petArtUrl, type Pet } from '@shared/core';

/**
 * A pet's generated art, falling back to its emoji avatar.
 *
 * Progressive enhancement, matching the web app's `pet-art.tsx`. The emoji is
 * what every pet has; the image is layered on when `IMAGE_SERVICE_URL` is
 * configured, the pet has an identifier the service can resolve, and the image
 * actually loads. Any of those failing leaves the card as it was rather than
 * showing a broken frame.
 *
 * The route shape itself lives in `@shared/core`, so both clients address pets
 * identically and only the environment read differs.
 */

/**
 * How long to wait before the single retry, matching the `Retry-After: 30` the
 * service sends while a pet's art is still generating.
 *
 * An <Image> reports only that it failed, never why, so a 503 meaning "come
 * back shortly" is indistinguishable from a 404 that never will be. One retry
 * covers the first case: without it the first viewer of a cold pet sees the
 * emoji until they reload, even though the art finished seconds later. One is
 * also the limit, so a list of genuinely broken images does not retry forever.
 */
const RETRY_AFTER_MS = 30_000;

type Props = {
    pet: Pick<Pet, 'id' | 'chain' | 'assetKey' | 'dna'>;
    /** Square edge in px. Also sizes the emoji, so the two swap without reflow. */
    size?: number;
};

export default function PetArt({ pet, size = 44 }: Props) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Cleared on unmount so a list scrolled away leaves no timers behind, and
    // React never sets state on an unmounted component.
    useEffect(() => () => clearTimeout(timer.current), []);

    const url = petArtUrl(pet, IMAGE_SERVICE_URL);
    const emoji = getPetAvatar(pet.dna);

    const onError = () => {
        if (attempt > 0) {
            setFailed(true);
            return;
        }
        timer.current = setTimeout(() => setAttempt(1), RETRY_AFTER_MS);
    };

    const box = { width: size, height: size };
    const emojiText = { fontSize: size * 0.72, lineHeight: size };

    if (!url || failed) {
        return (
            <View style={[styles.frame, box]}>
                <Text style={emojiText}>{emoji}</Text>
            </View>
        );
    }

    // The emoji stays mounted underneath until the image reports it loaded, so
    // the swap costs no layout pass and a slow first generation shows something
    // rather than an empty square.
    return (
        <View style={[styles.frame, box]}>
            {loaded ? null : <Text style={emojiText}>{emoji}</Text>}
            <Image
                // Remounts for the retry: reusing the element with an unchanged
                // uri would not refetch. The 503 is sent no-store, so there is
                // nothing cached to serve instead.
                key={attempt}
                source={{ uri: url }}
                resizeMode="contain"
                onLoad={() => setLoaded(true)}
                onError={onError}
                style={[styles.image, box, loaded ? null : styles.hidden]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    hidden: {
        opacity: 0,
    },
});
