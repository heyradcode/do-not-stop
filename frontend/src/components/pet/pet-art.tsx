import React, { useEffect, useRef, useState } from 'react';
import { getPetAvatar, petArtUrl as buildPetArtUrl, type Pet } from '@shared/core';

/**
 * A pet's generated art, falling back to its emoji avatar.
 *
 * Progressive enhancement on purpose. The emoji is what shipped and what every
 * pet has; the image is an improvement layered on top when three things hold:
 * `VITE_IMAGE_SERVICE_URL` is configured, the pet has an identifier the service
 * can resolve, and the image actually loads. Any of those failing leaves the UI
 * exactly as it was rather than showing a broken frame.
 *
 * The emoji also covers the first-ever request for a pet, which is slow: art is
 * generated on demand and the response can take seconds. Showing the emoji until
 * the image arrives beats an empty box.
 *
 * Sizing is inherited, not declared: the image is 1em square, so it matches
 * whatever font-size the surrounding avatar style already sets, and no CSS
 * changes anywhere.
 */

/**
 * How long to wait before the single retry, matching the `Retry-After: 30` the
 * service sends when a pet's art is still generating.
 *
 * An <img> reports only that it failed, never why, so a 503 that means "come back
 * shortly" is indistinguishable from a 404 that never will be. One retry is the
 * cheap way to cover the first: without it the very first viewer of a cold pet
 * sees the emoji until they reload the page, even though the art finished
 * seconds later. One is also the limit: a gallery of genuinely broken images
 * should not retry forever.
 */
const RETRY_AFTER_MS = 30_000;

/**
 * The route shape lives in `@shared/core` so the mobile app addresses pets the
 * same way; only the environment read is web-specific.
 */
export const petArtUrl = (pet: Pick<Pet, 'id' | 'chain' | 'assetKey'>): string | null =>
    // Read here rather than at module scope. Vite substitutes import.meta.env at
    // build time either way, so this costs nothing, and it means a test can stub
    // the variable without re-importing the module: doing that per test forced
    // vi.resetModules() and a dynamic import, which under a full parallel run was
    // slow enough to hit the default timeout and fail at random.
    buildPetArtUrl(pet, import.meta.env.VITE_IMAGE_SERVICE_URL);

type PetArtProps = {
    pet: Pick<Pet, 'id' | 'chain' | 'assetKey' | 'dna' | 'name'>;
    /**
     * Cover the nearest positioned ancestor instead of sizing to 1em.
     *
     * Only the image breaks out; the emoji stays inline and keeps whatever
     * font-size and animation the caller already gave it. That split is the
     * point: a card wants art bleeding to its edges, but an emoji stretched
     * to the same box would just be a huge glyph on a large empty field.
     *
     * The frame is the nearest ancestor that establishes a containing block, so
     * with `fill` the caller must put any `filter`, `transform` or animated
     * transform on the emoji (see `emojiClassName`) rather than on a wrapper
     * around this component. All three make an element a containing block for
     * absolutely positioned descendants, which silently traps the image at the
     * wrapper's size instead of the frame's.
     */
    fill?: boolean;
    /**
     * Applied to the emoji fallback only, so decoration meant for the glyph
     * (size, glow, float) does not land on the art. See `fill`.
     */
    emojiClassName?: string;
};

const PetArt: React.FC<PetArtProps> = ({ pet, fill = false, emojiClassName }) => {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Cleared on unmount so a gallery that scrolls away does not leave timers
    // behind, and React never sets state on an unmounted component.
    useEffect(() => () => clearTimeout(timer.current), []);

    const url = petArtUrl(pet);
    const emoji = getPetAvatar(pet.dna);

    const onError = () => {
        if (attempt > 0) {
            setFailed(true);
            return;
        }
        timer.current = setTimeout(() => setAttempt(1), RETRY_AFTER_MS);
    };

    // Bare text when the caller has no class for it, so the many callers that
    // style an ancestor instead keep exactly the DOM they had.
    const emojiNode = emojiClassName ? <span className={emojiClassName}>{emoji}</span> : emoji;

    if (!url || failed) return <>{emojiNode}</>;

    // The emoji and the image share one grid cell, so they stack without a
    // wrapper that reserves its own space, and swapping them causes no layout
    // shift. The image is hidden with opacity rather than `display: none`
    // specifically because it must keep a layout box: `loading="lazy"` defers
    // until the element nears the viewport, and an element with no box has
    // nothing to intersect, so hiding it that way risks never loading it at all.
    return (
        <span style={{ display: 'grid', placeItems: 'center', lineHeight: 1 }}>
            {loaded ? null : <span style={{ gridArea: '1 / 1' }}>{emojiNode}</span>}
            <img
                // Remounts for the retry: reusing the element with an unchanged
                // src would not refetch. The 503 is sent no-store, so the browser
                // has nothing cached to serve instead.
                key={attempt}
                src={url}
                alt={pet.name}
                // A gallery mounts every card at once, and on a cold cache each
                // miss is a generation queued behind the service's concurrency
                // limit. Lazy loading means only pets actually on screen ask for
                // art, which is the difference between a handful of requests and
                // one per pet in the collection.
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={onError}
                style={
                    fill
                        ? {
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              // cover, not contain: the art is square and the frame
                              // is wider than it is tall, so contain would letterbox
                              // it down to the frame's height and end up barely
                              // larger than the emoji it replaced.
                              objectFit: 'cover',
                              opacity: loaded ? 1 : 0,
                          }
                        : {
                              gridArea: '1 / 1',
                              width: '1em',
                              height: '1em',
                              objectFit: 'contain',
                              opacity: loaded ? 1 : 0,
                          }
                }
            />
        </span>
    );
};

export default PetArt;
