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
 * (docs/battle-protocol.md Appendix C).
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
 * `activeKeyIds` decides which keys are reported active; everything else is rotated,
 * whatever the rows happen to say. An operator who swapped keys without registering the old
 * one explicitly still gets the right answer.
 *
 * A set rather than one id, because §G separates keys per reward domain: a deployment
 * serving both EVM and Solana has two keys signing at once, and reporting either as rotated
 * would tell a verifier the current key had been retired.
 *
 * A compromised key is never reported active, even if it somehow matches `activeKeyId`.
 * Signing with a key known to be compromised is the situation the runbook exists to end, so
 * the registry refuses to describe it as the current one.
 */
export async function loadSigningKeys(activeKeyIds: ReadonlySet<string>): Promise<SigningKeyDescriptor[]> {
    const rows = await prisma.battleSigningKey.findMany({ orderBy: { notBefore: 'asc' } });
    return rows.map((row) => ({
        keyId: row.keyId,
        algorithm: row.algorithm as SigningKeyDescriptor['algorithm'],
        publicKey: row.publicKey as Hex,
        address: row.address as Hex,
        notBefore: Number(row.notBefore),
        notAfter: row.notAfter === null ? null : Number(row.notAfter),
        status: row.compromised ? 'compromised' : activeKeyIds.has(row.keyId) ? 'active' : 'rotated',
    }));
}

/**
 * Stamps a validity end on every key that has stopped signing (§G).
 *
 * §G asks for published validity periods, and the verifier already enforces them: it
 * refuses a receipt created outside `[notBefore, notAfter]` for the key that signed it. But
 * nothing ever *set* `notAfter`, so a rotated key stayed published as `null` — "still
 * valid, indefinitely". A key retired months ago would happily vouch for a receipt dated
 * today, which is exactly the window the check exists to close.
 *
 * `notAfter` is derived from evidence rather than guessed: the `createdAt` of the last
 * receipt the key actually signed. That is the strongest claim the data supports, and it is
 * safe in the direction that matters — every receipt the key legitimately produced is at or
 * before it, so stamping can never invalidate one. Using "now" instead would overstate the
 * window by however long the rotation went unnoticed, and using the successor's start would
 * assume a handover nobody recorded.
 *
 * A key that signed nothing gets `notAfter = notBefore`: a zero-length window, which is the
 * honest description of a key that was configured and never used.
 *
 * Idempotent, and skips keys that already carry an end, so re-running it cannot move a
 * window that was set deliberately — including one set by an operator during a compromise,
 * where the recorded time is a decision rather than an observation.
 */
export async function retireInactiveKeys(activeKeyIds: ReadonlySet<string>): Promise<{ retired: number }> {
    const stale = await prisma.battleSigningKey.findMany({
        where: { notAfter: null, keyId: { notIn: [...activeKeyIds] } },
        select: { keyId: true, notBefore: true },
    });

    let retired = 0;
    for (const key of stale) {
        const last = await prisma.battleReceipt.findFirst({
            where: { signingKeyId: key.keyId },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const notAfter = last?.createdAt ?? key.notBefore;

        // Guarded on `notAfter` still being null, so two processes booting at once produce
        // one stamp rather than the later one overwriting the earlier.
        const { count } = await prisma.battleSigningKey.updateMany({
            where: { keyId: key.keyId, notAfter: null },
            data: { notAfter },
        });
        if (count > 0) {
            retired += 1;
            console.warn(
                `[battle-signer] key ${key.keyId} is no longer signing; published validity now ends at ${notAfter} ` +
                    `(${last ? 'its last receipt' : 'it never signed'})`,
            );
        }
    }
    return { retired };
}
