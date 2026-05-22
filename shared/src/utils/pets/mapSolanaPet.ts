import type { Pet } from '../../types/pet';

type BNLike = { toString(): string };

function toBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    if (value && typeof (value as BNLike).toString === 'function') {
        return BigInt((value as BNLike).toString());
    }
    return 0n;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof (value as BNLike).toString === 'function') {
        return Number((value as BNLike).toString());
    }
    return 0;
}

function decodePetName(nameField: unknown, nameLen: unknown): string {
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
}

export interface SolanaPetAccountRow {
    publicKey: { toBase58: () => string } | unknown;
    account: Record<string, unknown>;
}

export function mapSolanaPet(row: SolanaPetAccountRow): Pet {
    const a = row.account;
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
    };
}
