import type { Hex } from '@cryptopets/protocol';

import { prisma } from '@config/prisma';

import type { SigningKeyDescriptor } from './signer.types';

/**
 * Durable storage for the signing-key registry (§G, §H item 4).
 *
 * The registry is what makes a receipt checkable by anyone else: a verifier asks which
 * addresses to trust, and a key missing from the answer makes every receipt it signed
 * *unverifiable* rather than invalid. Keeping the list only in memory meant a process
 * restart silently retracted the ability to check historical receipts — the one thing §H
 * promises never happens.
 *
 * **Status is derived, not stored.** Whether a key is active depends on which key this
 * process is currently signing with, and a stored `status` column would go stale the moment
 * a deployment changed its key without anyone remembering to update the row. Persisting only
 * the facts — the key, and when it stopped signing — means a forgotten rotation still leaves
 * the old key published, which is the safe direction to fail in.
 */

/**
 * Records a key, or updates the validity window of one already known.
 *
 * `compromised` is sticky: once a key has been marked compromised it stays so, even if a
 * later call passes a milder status. Downgrading that flag would quietly turn "this key may
 * have signed things we did not authorise" back into an ordinary rotation, and the whole
 * point of the distinction is that the two demand different responses
 * (docs/runbook-signing-key-compromise.md).
 */
export async function persistSigningKey(key: SigningKeyDescriptor): Promise<void> {
    const compromised = key.status === 'compromised';
    await prisma.battleSigningKey.upsert({
        where: { keyId: key.keyId },
        // `publicKey`/`address` are deliberately not updated: a key id whose material changed
        // is a different key wearing the same name, and quietly overwriting it would make
        // every receipt signed under the old material unverifiable.
        update: {
            notAfter: key.notAfter === null ? null : BigInt(key.notAfter),
            ...(compromised ? { compromised: true } : {}),
        },
        create: {
            keyId: key.keyId,
            algorithm: key.algorithm,
            publicKey: key.publicKey,
            address: key.address.toLowerCase(),
            notBefore: BigInt(key.notBefore),
            notAfter: key.notAfter === null ? null : BigInt(key.notAfter),
            compromised,
        },
    });
}

/**
 * Every key this deployment has ever used, as descriptors.
 *
 * `activeKeyId` decides which key is reported active; everything else is rotated, whatever
 * the rows happen to say. An operator who swapped keys without registering the old one
 * explicitly still gets the right answer.
 *
 * A compromised key is never reported active, even if it somehow matches `activeKeyId`.
 * Signing with a key known to be compromised is the situation the runbook exists to end, so
 * the registry refuses to describe it as the current one.
 */
export async function loadSigningKeys(activeKeyId: string | null): Promise<SigningKeyDescriptor[]> {
    const rows = await prisma.battleSigningKey.findMany({ orderBy: { notBefore: 'asc' } });
    return rows.map((row) => ({
        keyId: row.keyId,
        algorithm: row.algorithm as SigningKeyDescriptor['algorithm'],
        publicKey: row.publicKey as Hex,
        address: row.address as Hex,
        notBefore: Number(row.notBefore),
        notAfter: row.notAfter === null ? null : Number(row.notAfter),
        status: row.compromised ? 'compromised' : row.keyId === activeKeyId ? 'active' : 'rotated',
    }));
}
