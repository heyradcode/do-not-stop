import React, { useEffect, useRef, useState } from 'react';
import { petArtUrl, type PetChain } from '@shared/core';
import styles from '../index.module.css';

/**
 * The new pet's portrait, shown inside the create dialog.
 *
 * Deliberately not `PetArt`. That component is progressive enhancement for a
 * pet that already exists: it falls back to the emoji and retries once, because
 * a gallery of cards must not sit waiting on art. Here the art *is* the point —
 * the player is watching to see what they minted — so this waits, keeps asking
 * while the service generates, and shows `?` in the meantime.
 *
 * A `?` is also the right pre-mint state: the DNA is fixed by the entropy
 * reveal, so before settlement there is genuinely nothing to show. Commit-reveal
 * means not even the contract knows what this pet looks like yet.
 */

/**
 * Backoff between attempts, in ms. The service answers 503 with `Retry-After: 30`
 * while a pet's art generates, but an <img> reports only that it failed, so the
 * schedule is ours to choose. Front-loaded because a cache hit answers at once
 * and most misses finish within a few seconds; the tail covers a cold service
 * queueing behind its own concurrency limit. Runs ~2 minutes, then stops:
 * an unbounded retry against a genuinely broken service is just a hot loop.
 */
const RETRY_SCHEDULE_MS = [1_500, 3_000, 5_000, 8_000, 13_000, 21_000, 30_000, 30_000];

type Props = {
    /** Null until the mint settles; renders the placeholder. */
    petId: string | null;
    chain: PetChain;
};

const MintedPetArt: React.FC<Props> = ({ petId, chain }) => {
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    // A dialog closed mid-generation must not leave a timer behind.
    useEffect(() => () => clearTimeout(timer.current), []);

    // A second mint in the same session starts over rather than showing the
    // previous pet's portrait while the new one generates.
    useEffect(() => {
        clearTimeout(timer.current);
        setAttempt(0);
        setLoaded(false);
        setGaveUp(false);
    }, [petId]);

    const url = petId ? petArtUrl({ id: petId, chain }, import.meta.env.VITE_IMAGE_SERVICE_URL) : null;

    const onError = () => {
        const delay = RETRY_SCHEDULE_MS[attempt];
        if (delay === undefined) {
            setGaveUp(true);
            return;
        }
        timer.current = setTimeout(() => setAttempt((n) => n + 1), delay);
    };

    const waiting = Boolean(petId) && !loaded && !gaveUp;

    return (
        <div className={styles.portrait}>
            {url && !gaveUp ? (
                <img
                    // Remounts per attempt: an unchanged src would not refetch,
                    // and the 503 is sent no-store so nothing is cached to reuse.
                    key={attempt}
                    src={url}
                    // Named, not decorative: this image is the content of the
                    // dialog, and an empty alt would drop it from the
                    // accessibility tree entirely.
                    alt="Your new pet"
                    className={styles.portraitImg}
                    style={{ opacity: loaded ? 1 : 0 }}
                    onLoad={() => setLoaded(true)}
                    onError={onError}
                />
            ) : null}

            {loaded ? null : (
                <span className={styles.portraitMark} aria-hidden>
                    ?
                </span>
            )}

            {waiting ? <span className={styles.portraitHint}>Painting your pet…</span> : null}
            {gaveUp ? <span className={styles.portraitHint}>Portrait still rendering</span> : null}
        </div>
    );
};

export default MintedPetArt;
