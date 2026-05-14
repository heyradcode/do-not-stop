type PetLike = {
    dna: bigint;
    level: number;
    winCount: number;
    rarity: number;
};

type BattlePetLike = {
    level: number;
    winCount: number;
    lossCount: number;
};

export const getPetElement = (dna: bigint): string => {
    const elements = ['fire', 'water', 'electric', 'nature', 'shadow', 'cosmic'];
    return elements[Number(dna % BigInt(elements.length))];
};

export const getPetAvatar = (dna: bigint): string => {
    const avatars = ['🦊', '🐉', '🐈', '🐇', '🐺', '🦉'];
    return avatars[Number(dna % BigInt(avatars.length))];
};

export const getXpPercent = (pet: PetLike): number => {
    const value = pet.level * 12 + pet.winCount * 18 + pet.rarity * 10;
    return Math.max(0, Math.min(100, value % 101));
};

export const getXpNumbers = (pet: PetLike) => {
    const xpMax = Math.max(300, pet.level * 80 + 400);
    const xpCurrent = Math.floor((getXpPercent(pet) / 100) * xpMax);
    return { xpCurrent, xpMax };
};

export const getPetClass = (dna: bigint): string => {
    const classes = ['Fire Fox', 'Water Dragon', 'Electric Cat', 'Nature Beast', 'Shadow Hound', 'Cosmic Owl'];
    return classes[Number(dna % BigInt(classes.length))];
};

export const getGeneration = (dna: bigint): number => {
    return Number(dna % 3n) + 1;
};

export const getPetProperties = (pet: Pick<PetLike, 'dna'>) => {
    const dna = Number(pet.dna % 10000n);
    const seedA = Math.floor(dna / 3);
    const seedB = Math.floor(dna / 5);
    const seedC = Math.floor(dna / 7);

    return {
        life: 60 + (dna % 41),
        attack: 25 + (seedA % 51),
        defense: 20 + (seedB % 61),
        intelligence: 20 + (seedC % 61),
    };
};

export const getPropertyEmoji = (key: string): string => {
    const emojiMap: Record<string, string> = {
        life: '❤️',
        attack: '⚔️',
        defense: '🛡️',
        intelligence: '🧠',
    };
    return emojiMap[key] ?? '✨';
};

export const getLifePercent = (pet?: BattlePetLike): number => {
    if (!pet) return 0;
    const base = 50 + pet.level * 3 + pet.winCount * 4 - pet.lossCount * 2;
    return Math.max(10, Math.min(100, base));
};
