/**
 * Byte, hex, and unsigned-integer conversions used by the canonical encoder.
 *
 * Every function here is strict on purpose. A protocol hash that silently
 * accepts a malformed input produces a digest nobody can reproduce, which is
 * worse than a thrown error: the error stops a battle, the bad digest ships a
 * receipt no verifier can check.
 */

/** 0x-prefixed hex string. Canonically lowercase whenever this package emits one. */
export type Hex = `0x${string}`;

const HEX_PATTERN = /^0x[0-9a-fA-F]*$/;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Lowercase 0x-hex for `data`. */
export function bytesToHex(data: Uint8Array): Hex {
    let out = '0x';
    for (const byte of data) {
        out += byte.toString(16).padStart(2, '0');
    }
    return out as Hex;
}

/** Bytes for a 0x-hex string. Rejects a missing prefix, an odd length, or non-hex digits. */
export function hexToBytes(value: string): Uint8Array {
    if (!HEX_PATTERN.test(value)) {
        throw new Error(`not a 0x-prefixed hex string: ${JSON.stringify(value)}`);
    }
    const digits = value.slice(2);
    if (digits.length % 2 !== 0) {
        throw new Error(`hex string has an odd number of digits: ${value}`);
    }
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Accepts either representation of a byte string and returns bytes. */
export function toBytes(value: Uint8Array | string): Uint8Array {
    return typeof value === 'string' ? hexToBytes(value) : value;
}

/** UTF-8 bytes for `value`. */
export function utf8ToBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

/**
 * Big-endian fixed-width encoding of an unsigned integer.
 *
 * Fixed width is what makes these fields self-delimiting, so unlike byte
 * strings they need no length prefix. Out-of-range values throw rather than
 * wrap: a silently truncated pet id or timestamp is a wrong hash.
 */
export function uintToBytes(value: bigint | number, byteLength: number): Uint8Array {
    const big = typeof value === 'number' ? numberToBigint(value) : value;
    if (big < 0n) {
        throw new Error(`unsigned field cannot be negative: ${big}`);
    }
    const limit = 1n << BigInt(byteLength * 8);
    if (big >= limit) {
        throw new Error(`value ${big} does not fit in ${byteLength} bytes`);
    }
    const out = new Uint8Array(byteLength);
    let rest = big;
    for (let i = byteLength - 1; i >= 0; i--) {
        out[i] = Number(rest & 0xffn);
        rest >>= 8n;
    }
    return out;
}

function numberToBigint(value: number): bigint {
    if (!Number.isInteger(value)) {
        throw new Error(`expected an integer, got ${value}`);
    }
    if (!Number.isSafeInteger(value)) {
        throw new Error(`${value} exceeds Number.MAX_SAFE_INTEGER; pass a bigint`);
    }
    return BigInt(value);
}

/**
 * Normalizes a wallet address or pubkey to the form the protocol hashes.
 *
 * EVM addresses are case-insensitive, so they lowercase: a checksummed and a
 * lowercase spelling of one address must not produce two different intent
 * hashes. Solana base58 pubkeys are case-*sensitive* and pass through
 * untouched. This is the same normalization the backend already applies to the
 * JWT `storageKey` and the `users.address` primary key, so an account hashes
 * identically to how it is stored.
 */
export function normalizeAccount(value: string): string {
    if (value.length === 0) {
        throw new Error('account is empty');
    }
    return EVM_ADDRESS_PATTERN.test(value) ? value.toLowerCase() : value;
}

/** Concatenates byte chunks. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
    let total = 0;
    for (const chunk of chunks) {
        total += chunk.length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}
