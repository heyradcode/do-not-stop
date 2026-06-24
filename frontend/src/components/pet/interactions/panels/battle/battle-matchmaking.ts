import type { OpponentPet } from '@shared/core';

export type MatchTier = 'even' | 'easy' | 'risky' | 'danger' | 'unknown';

/** Opponent level minus fighter level; `null` when no fighter is selected. */
export const getLevelDelta = (
    fighterLevel: number | null,
    opponentLevel: number,
): number | null => {
    if (fighterLevel == null) return null;
    return opponentLevel - fighterLevel;
};

export const getMatchTier = (delta: number | null): MatchTier => {
    if (delta == null) return 'unknown';
    if (delta <= -2) return 'easy';
    if (delta >= 4) return 'danger';
    if (delta >= 2) return 'risky';
    return 'even';
};

export const getMatchLabel = (tier: MatchTier, delta: number | null): string | null => {
    if (delta == null || tier === 'unknown') return null;
    if (tier === 'even' && delta === 0) return 'Even match';
    if (delta > 0) return `+${delta} lv`;
    return `${delta} lv`;
};

/** Pick a random opponent whose level is closest to the fighter's. */
export const pickRandomOpponent = (
    opponents: OpponentPet[],
    fighterLevel: number,
): OpponentPet | null => {
    if (opponents.length === 0) return null;

    let minDistance = Number.POSITIVE_INFINITY;
    for (const opponent of opponents) {
        const distance = Math.abs(opponent.level - fighterLevel);
        if (distance < minDistance) minDistance = distance;
    }

    const pool = opponents.filter((o) => Math.abs(o.level - fighterLevel) === minDistance);
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
};

export const sortOpponentsByMatch = (
    opponents: OpponentPet[],
    fighterLevel: number | null,
): OpponentPet[] => {
    if (fighterLevel == null) return opponents;

    return [...opponents].sort((a, b) => {
        const deltaA = Math.abs(a.level - fighterLevel);
        const deltaB = Math.abs(b.level - fighterLevel);
        if (deltaA !== deltaB) return deltaA - deltaB;
        return a.level - b.level;
    });
};
