import type { Pet } from '../../types/pet';

type BNLike = { toString(): string };

const toBigInt = (value: unknown): bigint => {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    if (value && typeof (value as BNLike).toString === 'function') {
        return BigInt((value as BNLike).toString());
    }
    return 0n;
};

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof (value as BNLike).toString === 'function') {
        return Number((value as BNLike).toString());
    }
    return 0;
};

const decodePetName = (nameField: unknown, nameLen: unknown): string => {
    const len = toNumber(nameLen);
    if (!len || len <= 0) return '';

    let bytes: Uint8Array | null = null;
    if (nameField instanceof Uint8Array) {
        bytes = nameField;
    } else if (Array.isArray(nameField)) {
        bytes = Uint8Array.from(nameField as number[]);
    } else if (nameField && typeof nameField === 'object' && 'length' in (nameField as object)) {
        bytes = Uint8Array.from(nameField as ArrayLike<number>);
    }
    if (!bytes) return '';

    const slice = bytes.subarray(0, Math.min(len, bytes.length));
    return new TextDecoder().decode(slice);
};

export interface SolanaPetAccountRow {
    publicKey: { toBase58: () => string } | unknown;
    account: Record<string, unknown>;
}

const toBase58Key = (value: unknown): string | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    if (typeof obj['toBase58'] === 'function') return (obj as { toBase58(): string }).toBase58();
    return undefined;
};

export const mapSolanaPet = (row: SolanaPetAccountRow): Pet => {
    const a = row.account;
    const spouseId = toNumber(a.spouseId);
    return {
        id: toNumber(a.id).toString(),
        chain: 'solana',
        name: decodePetName(a.name, a.nameLen),
        dna: toBigInt(a.dna),
        level: toNumber(a.level),
        rarity: toNumber(a.rarity),
        winCount: toNumber(a.winCount),
        lossCount: toNumber(a.lossCount),
        readyAt: toNumber(a.readyTime),
        assetKey: toBase58Key(a.asset),
        xp: toNumber(a.xp) || undefined,
        generation: toNumber(a.generation),
        speciesId: toNumber(a.speciesId) || undefined,
        breedCount: toNumber(a.breedCount),
        breedReadyAt: toNumber(a.breedReadyTime) || undefined,
        trainReadyAt: toNumber(a.trainReadyTime) || undefined,
        spouseId: spouseId !== 0 ? spouseId : undefined,
        marriageCooldownUntil: toNumber(a.marriageCooldownUntil) || undefined,
    };
};
