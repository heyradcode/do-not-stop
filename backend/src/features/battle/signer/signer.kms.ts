import type { Hex } from '@cryptopets/protocol';
import { ethers } from 'ethers';

import { extractUncompressedPublicKey, toEthereumSignature } from './signer.kms.crypto';
import type { SignerBackend, SigningKeyDescriptor } from './signer.types';

/**
 * KMS-backed signing (§G).
 *
 * §G requires the production key to live in a managed KMS or HSM, restricted to signing
 * these digests and holding no asset or withdrawal authority. What that buys is specific:
 * compromising an API host stops being the same event as compromising the key, because the
 * host can ask for signatures but can never read the material or take it elsewhere.
 *
 * Everything here is provider-independent. A provider is reduced to `KmsKeyPort` — fetch a
 * public key, sign a digest — so the parts that are easy to get wrong (DER decoding, EIP-2
 * normalization, recovering `v`) are written and tested once, and an adapter is small
 * enough to read in one sitting.
 *
 * The public key is fetched from the KMS rather than configured. A configured address is a
 * second copy of the truth, and if it drifted the signer would publish one key while
 * signing with another, making every receipt it produced unverifiable against the registry.
 * Asking the KMS makes that impossible by construction.
 */

/**
 * The whole surface a provider has to implement.
 *
 * Deliberately two methods and no lifecycle. Anything wider — "sign this message", "create
 * a key", "list versions" — would put decisions in the adapter that belong in the signer,
 * and the signer's value is that it is narrow (see `signer.types.ts`).
 */
export interface KmsKeyPort {
    /** Human-readable provider name, for errors and the audit log. */
    readonly provider: string;
    /** SubjectPublicKeyInfo DER for the signing key. */
    getPublicKeyDer(): Promise<Uint8Array>;
    /** ECDSA signature over `digest`, DER-encoded, as AWS and GCP both return. */
    signDigest(digest: Uint8Array): Promise<Uint8Array>;
}

/**
 * Builds a signer over a provider port.
 *
 * The public key is read once at construction: it cannot change for a given key id, a
 * request per signature would add a round trip to the hot path, and reading it up front
 * means a misconfigured key fails at startup rather than on the first battle to reach
 * signing.
 */
export async function createKmsSignerFromPort(options: {
    port: KmsKeyPort;
    keyId: string;
    notBefore: number;
}): Promise<SignerBackend> {
    const { port, keyId, notBefore } = options;

    const publicKey = extractUncompressedPublicKey(await port.getPublicKeyDer());
    const address = ethers.computeAddress(publicKey).toLowerCase() as Hex;

    const key: SigningKeyDescriptor = {
        keyId,
        algorithm: 'secp256k1',
        publicKey,
        address,
        notBefore,
        notAfter: null,
        status: 'active',
    };

    return {
        key,
        async sign(digest: Uint8Array): Promise<Hex> {
            if (digest.length !== 32) {
                // Same guard the local backend carries: a backend that signs
                // arbitrary-length input is a general-purpose oracle.
                throw new Error(`expected a 32-byte digest, got ${digest.length}`);
            }
            const der = await port.signDigest(digest);
            // Checked against the published address, so a signature from a key other than
            // the one in the registry is refused here rather than discovered by a verifier.
            return toEthereumSignature(der, digest, address);
        },
    };
}

/**
 * Selects a provider adapter by name.
 *
 * Unknown providers throw rather than falling back. A fallback here would be an in-process
 * key wearing a KMS's name, and a deployment could then run believing the material was
 * isolated when it was sitting in the environment — which is the single thing §G's KMS
 * requirement exists to prevent.
 *
 * No adapter is wired yet: which provider this deployment uses is an open decision, and
 * guessing would mean committing an SDK dependency and a credential model to it. The parts
 * that do not depend on that answer are implemented and tested above.
 */
export function createKmsSigner(provider: string): SignerBackend {
    throw new Error(
        `KMS signer provider "${provider}" has no adapter yet. The provider-independent half is ` +
            'implemented (see createKmsSignerFromPort); what remains is a KmsKeyPort for this ' +
            'provider. Production signing must use a managed KMS/HSM key restricted to commitment ' +
            'and receipt digests (docs/battle-protocol.md §G) — do not set BATTLE_SIGNER_PRIVATE_KEY ' +
            'in production instead.',
    );
}
