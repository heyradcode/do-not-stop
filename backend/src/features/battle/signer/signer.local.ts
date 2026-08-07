import type { Hex } from '@cryptopets/protocol';
import { ethers } from 'ethers';

import type { SignerBackend, SigningKeyDescriptor } from './signer.types';

/**
 * Local development signer: a plain secp256k1 key held in this process.
 *
 * Explicitly not the production story. §G requires the key to live in a managed KMS, out of
 * the API and worker environments, precisely so that compromising a server does not
 * compromise the key. This backend exists so local development and tests can exercise the
 * signing path without a cloud dependency, and `createSignerBackend` refuses to select it
 * when the environment is production.
 */
export function createLocalSigner(options: {
    keyId: string;
    privateKey: string;
    notBefore: number;
}): SignerBackend {
    const signingKey = new ethers.SigningKey(normalizePrivateKey(options.privateKey));
    const key: SigningKeyDescriptor = {
        keyId: options.keyId,
        algorithm: 'secp256k1',
        publicKey: signingKey.publicKey as Hex,
        address: ethers.computeAddress(signingKey.publicKey).toLowerCase() as Hex,
        notBefore: options.notBefore,
        notAfter: null,
        status: 'active',
    };

    return {
        key,
        async sign(digest: Uint8Array): Promise<Hex> {
            if (digest.length !== 32) {
                // A backend that signs arbitrary-length input is a general-purpose oracle.
                throw new Error(`expected a 32-byte digest, got ${digest.length}`);
            }
            // Signs the digest as-is, with no EIP-191 prefix: what is signed must be exactly
            // the canonical receipt or commitment hash, so an on-chain verifier can recompute
            // it without knowing about a message-prefix convention.
            return signingKey.sign(digest).serialized as Hex;
        },
    };
}

function normalizePrivateKey(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}
