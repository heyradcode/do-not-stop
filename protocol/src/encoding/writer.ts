import {
    bytesToHex,
    concatBytes,
    type Hex,
    normalizeAccount,
    toBytes,
    uintToBytes,
    utf8ToBytes,
} from './bytes';
import type { DomainTag } from './domain';
import { keccak256 } from './hash';

/**
 * The canonical encoder. Every protocol hash is Keccak-256 over bytes produced
 * here, never over `JSON.stringify` output.
 *
 * Why not JSON: property order, number formatting, whitespace, and unicode
 * escaping are all implementation choices, and two correct JSON serializers can
 * disagree on all four. A receipt is meant to be recomputable by a stranger
 * years later, so the byte layout has to be the specification rather than a side
 * effect of whichever runtime produced it.
 *
 * Two properties matter:
 *
 * 1. **Every field is self-delimiting.** Fixed-width integers carry their width
 *    in the schema; variable-length values (byte strings, text, arrays) carry a
 *    4-byte big-endian count. Without that, `("ab", "c")` and `("a", "bc")`
 *    concatenate to identical bytes, and an attacker gets to shift a boundary
 *    without changing a digest.
 * 2. **A digest is bound to its object kind.** The domain tag is written first,
 *    so a receipt hash can never be reinterpreted as a commitment hash.
 *
 * Field order is part of the specification: it is the order the writer calls
 * appear in, and it must match the field lists in the architecture document.
 * There is deliberately no reader. Verifying means re-encoding a parsed object
 * and comparing digests, so a decoder would be a second place for the layout to
 * drift.
 */
export class CanonicalWriter {
    private readonly parts: Uint8Array[] = [];

    private constructor(domain: DomainTag) {
        this.text(domain);
    }

    /** Starts an encoding for one kind of object. The tag is written immediately. */
    static withDomain(domain: DomainTag): CanonicalWriter {
        return new CanonicalWriter(domain);
    }

    /** Unsigned 8-bit field. */
    u8(value: number): this {
        return this.push(uintToBytes(value, 1));
    }

    /** Unsigned 16-bit field. */
    u16(value: number): this {
        return this.push(uintToBytes(value, 2));
    }

    /** Unsigned 32-bit field. */
    u32(value: number): this {
        return this.push(uintToBytes(value, 4));
    }

    /** Unsigned 64-bit field. Timestamps, beacon rounds, and sequence numbers. */
    u64(value: bigint | number): this {
        return this.push(uintToBytes(value, 8));
    }

    /** Unsigned 256-bit field. DNA, seeds, and token amounts. */
    u256(value: bigint | number): this {
        return this.push(uintToBytes(value, 32));
    }

    /** Boolean as a single 0x00 / 0x01 byte. */
    bool(value: boolean): this {
        return this.push(uintToBytes(value ? 1 : 0, 1));
    }

    /** A 32-byte digest, as bytes or 0x-hex. Fixed width, so no length prefix. */
    hash(value: Uint8Array | Hex): this {
        const bytes = toBytes(value);
        if (bytes.length !== 32) {
            throw new Error(`expected a 32-byte hash, got ${bytes.length} bytes`);
        }
        return this.push(bytes);
    }

    /** Variable-length byte string, length-prefixed. */
    bytes(value: Uint8Array | Hex): this {
        const bytes = toBytes(value);
        return this.push(uintToBytes(bytes.length, 4)).push(bytes);
    }

    /**
     * Variable-length text, length-prefixed with its UTF-8 **byte** count.
     *
     * Ids that exceed a JS number (pet ids, dna) travel as decimal strings in
     * this codebase; prefer a numeric field for those where the schema allows it,
     * so `"07"` and `"7"` cannot be two spellings of one value.
     */
    text(value: string): this {
        const bytes = utf8ToBytes(value);
        return this.push(uintToBytes(bytes.length, 4)).push(bytes);
    }

    /** Wallet address or pubkey, normalized first (see `normalizeAccount`). */
    account(value: string): this {
        return this.text(normalizeAccount(value));
    }

    /**
     * Count-prefixed sequence. Order is significant and never sorted implicitly:
     * a caller that needs order-independence sorts before encoding, so the
     * ordering rule stays visible at the call site.
     */
    array<T>(items: readonly T[], write: (writer: this, item: T) => void): this {
        this.push(uintToBytes(items.length, 4));
        for (const item of items) {
            write(this, item);
        }
        return this;
    }

    /**
     * Optional field: one presence byte, then the value if present. The presence
     * byte is what keeps an absent field distinct from an empty one, so a missing
     * `defenseAuthorizationHash` cannot collide with a zeroed one.
     */
    optional<T>(value: T | null | undefined, write: (writer: this, value: T) => void): this {
        if (value === null || value === undefined) {
            return this.push(uintToBytes(0, 1));
        }
        this.push(uintToBytes(1, 1));
        write(this, value);
        return this;
    }

    /** The encoded bytes. */
    build(): Uint8Array {
        return concatBytes(this.parts);
    }

    /** Keccak-256 of the encoded bytes. */
    digest(): Uint8Array {
        return keccak256(this.build());
    }

    /** Keccak-256 of the encoded bytes, as 0x-hex. */
    digestHex(): Hex {
        return bytesToHex(this.digest());
    }

    private push(bytes: Uint8Array): this {
        this.parts.push(bytes);
        return this;
    }
}
