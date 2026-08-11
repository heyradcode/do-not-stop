/**
 * Base58 (Bitcoin alphabet), which is how Solana spells a 32-byte pubkey.
 *
 * Hand-written rather than depending on `bs58`, because this package is what third parties
 * run to verify a receipt: every dependency here is one they have to trust and install. The
 * algorithm is small enough that carrying it costs less than the dependency does.
 *
 * The alphabet deliberately omits `0`, `O`, `I`, and `l`. One useful consequence: no base58
 * string can begin with `0`, so a caller can tell a base58 pubkey from `0x`-hex by looking
 * at the first character.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Reverse lookup, built once. `-1` for any character outside the alphabet. */
const VALUES: readonly number[] = (() => {
    const table = new Array<number>(128).fill(-1);
    for (let i = 0; i < ALPHABET.length; i++) {
        table[ALPHABET.charCodeAt(i)] = i;
    }
    return table;
})();

/**
 * Bytes for a base58 string.
 *
 * Throws on an empty string or any character outside the alphabet, rather than skipping it.
 * A silently ignored character would decode a typo'd pubkey to a valid-looking but different
 * key, which in a reward leaf means an entitlement payable to nobody.
 */
export function base58ToBytes(value: string): Uint8Array {
    if (value.length === 0) {
        throw new Error('base58 string is empty');
    }

    // Little-endian during accumulation, reversed at the end.
    const bytes: number[] = [];
    for (const char of value) {
        const code = char.charCodeAt(0);
        let carry = code < 128 ? VALUES[code]! : -1;
        if (carry < 0) {
            throw new Error(`not a base58 character: ${JSON.stringify(char)}`);
        }
        for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i]! * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // A leading '1' is a leading zero byte, not a digit. Without this an all-zero pubkey
    // decodes to nothing and a key with a zero prefix decodes short.
    for (let i = 0; i < value.length && value[i] === '1'; i++) {
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

/** Base58 for `data`. The inverse of `base58ToBytes`. */
export function bytesToBase58(data: Uint8Array): string {
    if (data.length === 0) {
        return '';
    }

    const digits: number[] = [];
    for (const byte of data) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
            carry += digits[i]! << 8;
            digits[i] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }

    let out = '';
    for (let i = 0; i < data.length && data[i] === 0; i++) {
        out += '1';
    }
    for (let i = digits.length - 1; i >= 0; i--) {
        out += ALPHABET[digits[i]!];
    }
    return out;
}
