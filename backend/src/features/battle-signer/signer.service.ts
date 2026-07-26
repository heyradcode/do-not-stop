import {
    assertBattleCommitment,
    assertBattleReceipt,
    hashBattleCommitment,
    hashBattleReceipt,
    type Hex,
    toBytes,
} from '@cryptopets/protocol';

import { env } from '@config/env';

import { createKmsSigner } from './signer.kms';
import { createLocalSigner } from './signer.local';
import { loadSigningKeys, persistSigningKey } from './signer.registry';
import {
    type EngineAttestation,
    type SignerAuditEntry,
    type SignerBackend,
    SignerRefusedError,
    type SigningKeyDescriptor,
    type SignRequest,
    type SignResult,
} from './signer.types';

/**
 * The signing service (§G).
 *
 * The digest is always recomputed here from the typed object. That is the load-bearing design
 * choice: a caller cannot ask for a signature over bytes of its own choosing, so a compromised
 * worker can at most get a signature over a *well-formed* commitment or receipt, which the
 * rest of the system can then check. It cannot obtain a signature over anything else at all.
 */

let backend: SignerBackend | null = null;
let backendError: string | null = null;
const rotatedKeys: SigningKeyDescriptor[] = [];
const auditLog: SignerAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

/**
 * Selects a backend from configuration.
 *
 * Refuses to use the in-process key in production. A key sitting in an environment variable on
 * an API host is the thing §G's KMS requirement exists to prevent, and making that a startup
 * failure rather than a warning is the difference between a blocked deploy and a quiet
 * downgrade nobody notices until the incident.
 */
export function configureSigner(nowSeconds: number): void {
    backend = null;
    backendError = null;

    const { keyId, privateKey, kmsProvider } = env.battleSigner;

    if (kmsProvider) {
        try {
            backend = createKmsSigner(kmsProvider);
        } catch (error) {
            backendError = (error as Error).message;
        }
        return;
    }

    if (!privateKey) {
        backendError = 'no signing backend configured (set BATTLE_SIGNER_KMS_PROVIDER, or a dev key locally)';
        return;
    }

    if (env.isProduction) {
        backendError =
            'refusing to use BATTLE_SIGNER_PRIVATE_KEY in production; the signing key must live in a KMS (§G)';
        return;
    }

    backend = createLocalSigner({ keyId, privateKey, notBefore: nowSeconds });
}

/**
 * Registers a key that is no longer signing but must stay published for verification.
 *
 * Writes through to storage as well as memory. The in-memory copy keeps `listSigningKeys`
 * synchronous, which matters because it runs on every receipt verification; the persisted
 * copy is what survives a restart.
 *
 * Persistence is best-effort here so a database blip cannot fail a rotation half-way — but
 * an unpersisted key is a real gap, so it is logged loudly rather than swallowed. Rerunning
 * `registerRotatedKey` is idempotent and is the fix.
 */
export function registerRotatedKey(key: SigningKeyDescriptor): void {
    if (!rotatedKeys.some((existing) => existing.keyId === key.keyId)) {
        rotatedKeys.push(key);
    }
    void persistSigningKey(key).catch((error: unknown) => {
        console.error(
            `[battle-signer] failed to persist rotated key ${key.keyId}: ${(error as Error).message}. ` +
                'It is published by this process but will not survive a restart; re-register it once the database is reachable.',
        );
    });
}

/**
 * Reloads every key this deployment has ever used from storage.
 *
 * Called at startup, after `configureSigner`, so a restart republishes the keys that signed
 * historical receipts instead of quietly forgetting them. Without this the registry was only
 * ever as old as the process, and a rotated key disappeared on the next deploy — making its
 * receipts unverifiable rather than invalid, which is the failure §H exists to prevent.
 */
export async function loadPersistedSigningKeys(): Promise<void> {
    const active = activeSigningKey();
    if (active) {
        // Recorded on every boot, so the key currently signing is in the registry even if it
        // is never explicitly rotated out later.
        await persistSigningKey(active);
    }

    const stored = await loadSigningKeys(active?.keyId ?? null);
    rotatedKeys.length = 0;
    for (const key of stored) {
        if (key.keyId !== active?.keyId) {
            rotatedKeys.push(key);
        }
    }
}

/** The key currently signing, or null when the signer is unconfigured. */
export function activeSigningKey(): SigningKeyDescriptor | null {
    return backend?.key ?? null;
}

/**
 * Every key a verifier may need, active and retired.
 *
 * Retired keys are never dropped: a receipt signed under a rotated key must still verify, and
 * removing the key would make that receipt unverifiable rather than invalid, which is a
 * different and worse thing (§H item 4).
 */
export function listSigningKeys(): SigningKeyDescriptor[] {
    const active = activeSigningKey();
    return active ? [active, ...rotatedKeys] : [...rotatedKeys];
}

/** The signer's own audit trail, newest last. Reconciled against the KMS log during an incident. */
export function signerAuditLog(): SignerAuditEntry[] {
    return [...auditLog];
}

/** Clears state. Tests only. */
export function resetSigner(): void {
    backend = null;
    backendError = null;
    rotatedKeys.length = 0;
    auditLog.length = 0;
}

/**
 * Signs a commitment or a receipt.
 *
 * Receipts additionally require an attestation from every configured attester, all naming the
 * same receipt hash. That is §F's circuit breaker expressed as a precondition: if the engine
 * and the independent verifier have not both agreed, there is no way to obtain a signature,
 * so a mismatch cannot be signed past by mistake.
 */
export async function sign(request: SignRequest, nowSeconds: number): Promise<SignResult> {
    if (!backend) {
        return refuse('signer-not-configured', backendError ?? 'signer is not configured', nowSeconds);
    }

    let digest: Hex;
    try {
        digest =
            request.kind === 'commitment'
                ? hashBattleCommitment(assertBattleCommitment(request.commitment))
                : hashBattleReceipt(assertBattleReceipt(request.receipt));
    } catch (error) {
        // An object that does not validate never reaches the key. The signer is the last place
        // that can still refuse a malformed receipt, and after it there is only history.
        return refuse('invalid-payload', (error as Error).message, nowSeconds);
    }

    if (request.kind === 'receipt') {
        const problem = checkAttestations(request.attestations, digest, nowSeconds);
        if (problem) {
            return refuse(problem.reason, problem.detail, nowSeconds);
        }
    }

    const signature = await backend.sign(toBytes(digest));
    record({
        at: nowSeconds,
        kind: request.kind,
        keyId: backend.key.keyId,
        digest,
        outcome: 'signed',
    });
    return { kind: request.kind, digest, signature, keyId: backend.key.keyId };
}

/**
 * Checks that every required attester has vouched for exactly this receipt.
 *
 * Matching on the receipt hash rather than on a battle id matters: an attestation for an
 * earlier version of the same battle's receipt must not carry over, since the point of the
 * attestation is that a specific set of bytes was recomputed and agreed with.
 */
function checkAttestations(
    attestations: readonly EngineAttestation[],
    digest: Hex,
    nowSeconds: number,
): { reason: 'missing-attestation' | 'attestation-mismatch' | 'stale-attestation'; detail: string } | null {
    const required = env.battleSigner.requiredAttesters;
    for (const attester of required) {
        const match = attestations.find((a) => a.attester === attester);
        if (!match) {
            return {
                reason: 'missing-attestation',
                detail: `no attestation from ${attester} (required: ${required.join(', ')})`,
            };
        }
        if (match.receiptHash.toLowerCase() !== digest.toLowerCase()) {
            return {
                reason: 'attestation-mismatch',
                detail: `${attester} attested to ${match.receiptHash}, but this receipt hashes to ${digest}`,
            };
        }
        if (match.attestedAt > nowSeconds + 60) {
            return { reason: 'stale-attestation', detail: `${attester} attestation is dated in the future` };
        }
    }
    return null;
}

function refuse(
    reason: SignerRefusedError['reason'],
    detail: string,
    nowSeconds: number,
): never {
    record({ at: nowSeconds, kind: 'refused', keyId: null, digest: null, outcome: 'refused', detail });
    throw new SignerRefusedError(reason, detail);
}

function record(entry: SignerAuditEntry): void {
    auditLog.push(entry);
    if (auditLog.length > MAX_AUDIT_ENTRIES) {
        auditLog.shift();
    }
}
