/**
 * Minimal base58 (Bitcoin alphabet) decode, enough to validate a Solana pubkey.
 *
 * Hand-rolled rather than pulled from a dependency: this is the only base58 the
 * service needs, and the alternative was taking @solana/web3.js purely to parse a
 * 32-byte string. Decode-only on purpose — nothing here needs to encode, since
 * identifiers are passed back out exactly as they arrived.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]!] = i;

/** Returns null for anything that is not valid base58, rather than throwing:
 *  callers treat a bad identifier as "no such pet", not as an error. */
export const base58Decode = (value: string): Buffer | null => {
    if (value.length === 0) return null;

    // Big-endian base conversion into a byte array. Starts empty, not [0]: a
    // seeded zero would survive as a phantom leading byte, so "1" would decode to
    // two bytes instead of one.
    const bytes: number[] = [];
    for (const char of value) {
        const digit = INDEX[char];
        if (digit === undefined) return null;

        let carry = digit;
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

    // Each leading '1' is one leading zero byte, which the arithmetic above drops.
    for (let i = 0; i < value.length && value[i] === '1'; i++) bytes.push(0);

    return Buffer.from(bytes.reverse());
};

/** A Solana pubkey is exactly 32 bytes once decoded. */
export const isValidPubkey = (value: string): boolean => base58Decode(value)?.length === 32;
