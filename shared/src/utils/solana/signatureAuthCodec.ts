import bs58 from 'bs58';

const ED25519_SIG_LEN = 64;

function decodeHex128(s: string): Uint8Array | null {
    const t = s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
    if (!/^[0-9a-fA-F]{128}$/.test(t)) {
        return null;
    }
    const out = new Uint8Array(ED25519_SIG_LEN);
    for (let i = 0; i < ED25519_SIG_LEN; i++) {
        out[i] = Number.parseInt(t.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Browser-safe base64 → bytes (standard or URL-safe, with padding fix). */
function decodeBase64To64(s: string): Uint8Array | null {
    try {
        const t = s.replace(/-/g, '+').replace(/_/g, '/');
        const padLen = (4 - (t.length % 4)) % 4;
        const padded = t + '='.repeat(padLen);
        const bin = atob(padded);
        if (bin.length !== ED25519_SIG_LEN) {
            return null;
        }
        const out = new Uint8Array(ED25519_SIG_LEN);
        for (let i = 0; i < ED25519_SIG_LEN; i++) {
            out[i] = bin.charCodeAt(i);
        }
        return out;
    } catch {
        return null;
    }
}

function decodeBase58To64(s: string): Uint8Array | null {
    try {
        const decoded = bs58.decode(s);
        if (decoded.length !== ED25519_SIG_LEN) {
            return null;
        }
        return new Uint8Array(decoded);
    } catch {
        return null;
    }
}

/**
 * Coerce wallet/SDK signature output to exactly 64 Ed25519 signature bytes.
 * Dynamic and other SDKs often return base64 or hex strings, not base58.
 */
export function coerceSolanaEd25519SignatureBytes(sig: unknown): Uint8Array {
    if (sig == null) {
        throw new TypeError('Missing Solana signature');
    }
    if (typeof sig === 'string') {
        const t = sig.trim();
        return (
            decodeHex128(t) ??
            decodeBase58To64(t) ??
            decodeBase64To64(t) ??
            (() => {
                throw new TypeError(
                    'Could not decode Solana signature string as hex (64 bytes), base58, or base64'
                );
            })()
        );
    }
    if (sig instanceof Uint8Array) {
        if (sig.length !== ED25519_SIG_LEN) {
            throw new TypeError(`Expected ${ED25519_SIG_LEN}-byte Ed25519 signature, got ${sig.length}`);
        }
        return sig;
    }
    if (Array.isArray(sig)) {
        const u = Uint8Array.from(sig as number[]);
        if (u.length !== ED25519_SIG_LEN) {
            throw new TypeError(`Expected ${ED25519_SIG_LEN}-byte Ed25519 signature, got ${u.length}`);
        }
        return u;
    }
    if (typeof sig === 'object' && sig !== null && 'signature' in sig) {
        return coerceSolanaEd25519SignatureBytes((sig as { signature: unknown }).signature);
    }
    if (ArrayBuffer.isView(sig)) {
        const view = sig as ArrayBufferView;
        const u = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        if (u.length !== ED25519_SIG_LEN) {
            throw new TypeError(`Expected ${ED25519_SIG_LEN}-byte Ed25519 signature, got ${u.length}`);
        }
        return u;
    }
    throw new TypeError('Unexpected Solana signature type from wallet');
}

/** Canonical wire format for `/api/auth/verify`: base58-encoded raw 64-byte signature. */
export function normalizeSolanaSignatureToBase58(sig: unknown): string {
    return bs58.encode(coerceSolanaEd25519SignatureBytes(sig));
}
