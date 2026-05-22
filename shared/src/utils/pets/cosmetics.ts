const RARITY_COLORS: Record<number, string> = {
    1: '#8B4513',
    2: '#C0C0C0',
    3: '#FFD700',
    4: '#FF69B4',
    5: '#8A2BE2',
};

const RARITY_NAMES: Record<number, string> = {
    1: 'Common',
    2: 'Uncommon',
    3: 'Rare',
    4: 'Epic',
    5: 'Legendary',
};

export const getRarityColor = (rarity: number): string => RARITY_COLORS[rarity] ?? '#8B4513';

export const getRarityName = (rarity: number): string => RARITY_NAMES[rarity] ?? 'Unknown';

export const isPetReadyAt = (readyAt: number): boolean => readyAt <= Date.now() / 1000;
