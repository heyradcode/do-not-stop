export { usePetError, type PetError } from '@shared/core';

/** Trims a tx hash or battle id to a short readable hint. UI-only. */
export const formatTxHashHint = (hash: string | undefined): string | null => {
    return hash ? `${hash.slice(0, 8)}…` : null;
};
