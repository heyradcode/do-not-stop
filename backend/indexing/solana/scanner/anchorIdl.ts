import bs58 from 'bs58';

/**
 * Minimal Anchor (0.30+) IDL reader + Borsh decoder for fixed-layout accounts.
 *
 * Reads the account discriminator and field layout straight from the IDL JSON
 * (the artifact `anchor build` emits), so adding/reordering/resizing a field in
 * the on-chain struct only requires dropping in a fresh IDL — no offset math in
 * code. Supports the fixed-size primitives + fixed `[u8; N]` arrays the project
 * uses; any variable-length type (string/vec/option) throws loudly at layout
 * resolution so unhandled schema changes fail fast at startup, never silently.
 */

export type IdlPrimitive =
    | 'bool'
    | 'u8'
    | 'i8'
    | 'u16'
    | 'i16'
    | 'u32'
    | 'i32'
    | 'u64'
    | 'i64'
    | 'pubkey';

export type IdlType = IdlPrimitive | { array: [IdlType, number] };

export interface IdlField {
    name: string;
    type: IdlType;
}

export interface AnchorIdl {
    accounts?: { name: string; discriminator: number[] }[];
    types?: { name: string; type: { kind: string; fields?: IdlField[] } }[];
}

export interface AccountLayout {
    discriminator: Buffer;
    discriminatorB58: string;
    fields: IdlField[];
    /** Serialized body size in bytes (excludes the 8-byte discriminator). */
    bodySize: number;
}

const PRIMITIVE_SIZES: Record<string, number> = {
    bool: 1,
    u8: 1,
    i8: 1,
    u16: 2,
    i16: 2,
    u32: 4,
    i32: 4,
    u64: 8,
    i64: 8,
    pubkey: 32,
};

function isPrimitive(t: IdlType): t is IdlPrimitive {
    return typeof t === 'string';
}

function sizeOf(t: IdlType): number {
    if (isPrimitive(t)) {
        const size = PRIMITIVE_SIZES[t];
        if (size === undefined) throw new Error(`Unsupported IDL primitive: ${t}`);
        return size;
    }
    if ('array' in t) {
        const [elem, len] = t.array;
        return sizeOf(elem) * len;
    }
    throw new Error(`Unsupported IDL type: ${JSON.stringify(t)}`);
}

function readValue(buf: Buffer, offset: number, t: IdlType): unknown {
    if (isPrimitive(t)) {
        switch (t) {
            case 'bool':
                return buf.readUInt8(offset) !== 0;
            case 'u8':
                return buf.readUInt8(offset);
            case 'i8':
                return buf.readInt8(offset);
            case 'u16':
                return buf.readUInt16LE(offset);
            case 'i16':
                return buf.readInt16LE(offset);
            case 'u32':
                return buf.readUInt32LE(offset);
            case 'i32':
                return buf.readInt32LE(offset);
            case 'u64':
                return buf.readBigUInt64LE(offset);
            case 'i64':
                return buf.readBigInt64LE(offset);
            case 'pubkey':
                return bs58.encode(buf.subarray(offset, offset + 32));
        }
    }
    if ('array' in t) {
        const [elem, len] = t.array;
        // Byte arrays (e.g. fixed name buffers) are returned raw for the caller to slice.
        if (elem === 'u8') return buf.subarray(offset, offset + len);
        const out: unknown[] = [];
        let cursor = offset;
        for (let i = 0; i < len; i++) {
            out.push(readValue(buf, cursor, elem));
            cursor += sizeOf(elem);
        }
        return out;
    }
    throw new Error(`Unsupported IDL type: ${JSON.stringify(t)}`);
}

/** Resolve an account's discriminator + field layout from the IDL (once, at load). */
export function resolveAccountLayout(idl: AnchorIdl, accountName: string): AccountLayout {
    const account = idl.accounts?.find((a) => a.name === accountName);
    if (!account) throw new Error(`IDL has no account named "${accountName}"`);

    const typeDef = idl.types?.find((t) => t.name === accountName);
    const fields = typeDef?.type?.fields;
    if (!fields) throw new Error(`IDL has no struct type for "${accountName}"`);

    const discriminator = Buffer.from(account.discriminator);
    const bodySize = fields.reduce((sum, field) => sum + sizeOf(field.type), 0);

    return {
        discriminator,
        discriminatorB58: bs58.encode(discriminator),
        fields,
        bodySize,
    };
}

/** Decode a Borsh-packed struct body (discriminator already stripped) into a field map. */
export function decodeStruct(fields: IdlField[], body: Buffer): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let offset = 0;
    for (const field of fields) {
        out[field.name] = readValue(body, offset, field.type);
        offset += sizeOf(field.type);
    }
    return out;
}
