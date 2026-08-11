import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms';

import type { KmsKeyPort } from './signer.kms';

/**
 * AWS KMS adapter for the battle signer (§G).
 *
 * Small on purpose: everything fiddly about turning a KMS response into an Ethereum
 * signature lives in `signer.kms.crypto.ts`, so this is only "fetch bytes, sign bytes".
 *
 * Two AWS specifics are load-bearing:
 *
 * - **`MessageType: 'DIGEST'`.** The default is `RAW`, which makes KMS hash the input
 *   itself — so passing an already-hashed receipt would sign `SHA-256(receiptHash)` and
 *   produce a signature that verifies against nothing anyone can recompute. The algorithm
 *   is still named `ECDSA_SHA_256` in that mode; it describes the digest being supplied,
 *   not a second hashing step.
 * - **`ECC_SECG_P256K1` key spec.** AWS also offers P-256, whose signatures are the same
 *   shape and useless here. The curve is not visible in the signature, so a key created on
 *   the wrong one fails at `toEthereumSignature` with "does not recover to the published
 *   key" rather than anything mentioning curves — worth knowing before debugging that.
 *
 * The IAM policy for this key should permit `kms:Sign` and `kms:GetPublicKey` and nothing
 * else, and the key should have no other grants. §G's requirement is not "the key is in
 * AWS" but "the key can only sign these digests and holds no asset authority".
 */

export interface AwsKmsOptions {
    /** Key id, alias (`alias/battle-signer`), or full ARN. */
    keyId: string;
    /** Omitted when the environment already supplies one, e.g. on ECS or Lambda. */
    region?: string | undefined;
}

export function createAwsKmsPort(options: AwsKmsOptions): KmsKeyPort {
    // Credentials come from the default provider chain — instance role, task role, or the
    // environment — never from configuration here. A key that requires this process to hold
    // long-lived secrets to reach it is a key whose isolation is only partial.
    const client = new KMSClient(options.region ? { region: options.region } : {});

    return {
        provider: 'aws-kms',

        async getPublicKeyDer(): Promise<Uint8Array> {
            const response = await client.send(new GetPublicKeyCommand({ KeyId: options.keyId }));
            if (!response.PublicKey) {
                throw new Error(`AWS KMS returned no public key for ${options.keyId}`);
            }
            if (response.KeySpec && response.KeySpec !== 'ECC_SECG_P256K1') {
                // Caught here rather than left to surface as an unrecoverable signature,
                // because the message there names neither the key nor the curve.
                throw new Error(
                    `AWS KMS key ${options.keyId} has spec ${response.KeySpec}; battle signing requires ECC_SECG_P256K1`,
                );
            }
            return response.PublicKey;
        },

        async signDigest(digest: Uint8Array): Promise<Uint8Array> {
            const response = await client.send(
                new SignCommand({
                    KeyId: options.keyId,
                    Message: digest,
                    // See above: without this AWS hashes the digest again.
                    MessageType: 'DIGEST',
                    SigningAlgorithm: 'ECDSA_SHA_256',
                }),
            );
            if (!response.Signature) {
                throw new Error(`AWS KMS returned no signature for ${options.keyId}`);
            }
            return response.Signature;
        },
    };
}
