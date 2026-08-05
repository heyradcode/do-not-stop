import bs58 from 'bs58';
import nacl from 'tweetnacl';

const ED25519_SIG_LEN = 64;

/**
 * Decode a Solana signature off the wire. Wallets send it as hex (optionally
 * 0x-prefixed), base58, or base64; try each and return the 64-byte ed25519
 * signature, or null if none yields a valid length.
 */
function decodeSolanaSignatureWire(signature: string): Uint8Array | null {
    const t = signature.trim();
    const hex = t.startsWith('0x') || t.startsWith('0X') ? t.slice(2) : t;
    if (/^[0-9a-fA-F]{128}$/i.test(hex)) {
        try {
            const out = Buffer.from(hex, 'hex');
            if (out.length === ED25519_SIG_LEN) {
                return new Uint8Array(out);
            }
        } catch {
            /* fall through */
        }
    }
    try {
        const decoded = bs58.decode(t);
        if (decoded.length === ED25519_SIG_LEN) {
            return new Uint8Array(decoded);
        }
    } catch {
        /* fall through */
    }
    try {
        const buf = Buffer.from(t, 'base64');
        if (buf.length === ED25519_SIG_LEN) {
            return new Uint8Array(buf);
        }
    } catch {
        /* fall through */
    }
    return null;
}

/** Verify an ed25519 signature over `message` for a base58 Solana address. */
export function verifySolanaSignature(address: string, signatureWire: string, message: string): boolean {
    try {
        const pubKey = new Uint8Array(bs58.decode(address));
        if (pubKey.length !== 32) {
            return false;
        }
        const sig = decodeSolanaSignatureWire(signatureWire);
        if (!sig) {
            return false;
        }
        const msgBytes = new TextEncoder().encode(message);
        return nacl.sign.detached.verify(msgBytes, sig, pubKey);
    } catch {
        return false;
    }
}
