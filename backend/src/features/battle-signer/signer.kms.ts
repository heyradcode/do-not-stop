import type { SignerBackend } from './signer.types';

/**
 * KMS-backed signer: not implemented yet, on purpose.
 *
 * §G requires the production key to live in a managed KMS or HSM, restricted to signing these
 * digests and holding no asset or withdrawal authority. Which provider that is has not been
 * decided (it is an open item in the step plan), and the wrong move here would be a stub that
 * looks like a KMS and quietly holds a key in process memory: a deployment could then run on
 * it believing the key was isolated.
 *
 * So this throws with instructions instead. `createSignerBackend` refuses to start in
 * production without a real backend, which means the missing piece blocks a production launch
 * rather than silently degrading one.
 *
 * Implementing it needs, per §G: a key that can only sign, an audit log of every request with
 * its digest and key version, separate keys per reward domain, and published validity periods
 * with rotated-out keys retained.
 */
export function createKmsSigner(provider: string): SignerBackend {
    throw new Error(
        `KMS signer provider "${provider}" is not implemented. Production signing must use a managed ` +
            'KMS/HSM key restricted to commitment and receipt digests (docs/battle-protocol.md §G). ' +
            'Implement an adapter here rather than setting BATTLE_SIGNER_PRIVATE_KEY in production.',
    );
}
