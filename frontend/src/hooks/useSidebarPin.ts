import { useCallback, useEffect, useState } from 'react';

/**
 * Whether the left sidebar is pinned open.
 *
 * Persisted, because it is a stated preference rather than transient UI state:
 * someone who pins the rail means "keep it open", and having to re-pin on every
 * reload would make the control feel broken.
 */
const STORAGE_KEY = 'cp.sidebar.pinned';

/** Reads defensively: storage is unavailable in private-mode Safari and in SSR,
 *  and neither is a reason to fail to render a nav bar. */
const readStored = (): boolean => {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const useSidebarPin = (): { pinned: boolean; toggle: () => void } => {
    const [pinned, setPinned] = useState(readStored);

    useEffect(() => {
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, String(pinned));
        } catch {
            // A preference that cannot be saved still applies for this session.
        }
    }, [pinned]);

    const toggle = useCallback(() => setPinned((v) => !v), []);

    return { pinned, toggle };
};
