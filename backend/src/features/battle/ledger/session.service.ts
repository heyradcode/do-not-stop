import {
    type ChainId,
    chainFamily,
    hashSessionDelegation,
    normalizeAccount,
    type SessionDelegation,
    sessionCovers,
    sessionDelegationSolanaMessage,
    sessionDelegationTypedData,
} from '@cryptopets/protocol';
import { ethers } from 'ethers';

import { prisma } from '@config/prisma';
import { verifySolanaSignature } from '@features/auth/solana';

import { assertServedDomain, servedDeploymentId } from './domain';
import type { SignatureFormat } from './intent.service';

/**
 * Delegated battle-intent signing (§D).
 *
 * §D's rule is that a wallet authorizes a battle and a JWT does not, because a JWT is a
 * bearer token this server issues to itself: accepting one would mean the operator could
 * start battles as any player, burn their cooldowns, and move their standing, with nothing
 * in the record able to tell that apart from the player having done it.
 *
 * A delegation keeps that property and removes the prompt. The owner signs once, naming a
 * key the *client* generated and holds. The operator never sees the private key, so it
 * still cannot forge an intent. Only the number of times a human is asked changes.
 *
 * Three bounds make the delegated key visibly weaker than the wallet, and all three are
 * enforced here rather than trusted to the client: scope (battle intents alone), a window
 * the protocol caps at 24 hours, and revocation.
 */

export interface SessionDelegationWire {
    chainId: string;
    deploymentId: string;
    owner: string;
    sessionKey: string;
    scope: string;
    notBefore: number;
    expiresAt: number;
    revocationNonce: number;
}

export type SessionRejection =
    | 'malformed-delegation'
    | 'wrong-deployment'
    | 'wallet-mismatch'
    | 'wrong-signature-format'
    | 'bad-signature'
    | 'already-expired'
    | 'stale-revocation-nonce';

export type SubmitSessionResult =
    | { ok: true; delegationHash: string; expiresAt: number }
    | { ok: false; reason: SessionRejection; detail: string };

export interface SubmitSessionRequest {
    delegation: SessionDelegationWire;
    signature: string;
    signatureFormat: SignatureFormat;
    /** Wallet from the verified JWT. Must be the delegating owner. */
    authenticatedWallet: string;
    nowSeconds: number;
}

/** Records a wallet-signed delegation after checking it says what it claims. */
export async function submitSessionDelegation(request: SubmitSessionRequest): Promise<SubmitSessionResult> {
    let delegation: SessionDelegation;
    try {
        delegation = toProtocolDelegation(request.delegation);
        assertServedDomain(delegation.domain);
    } catch (error) {
        const message = (error as Error).message;
        return message.includes('deployment') || message.includes('chain')
            ? reject('wrong-deployment', message)
            : reject('malformed-delegation', message);
    }

    // The JWT says who is calling; this says they are delegating their own authority and
    // not somebody else's. Both are required, and neither substitutes for the signature.
    if (normalizeAccount(request.authenticatedWallet) !== delegation.owner) {
        return reject(
            'wallet-mismatch',
            `authenticated wallet ${request.authenticatedWallet} is not the delegating owner ${delegation.owner}`,
        );
    }

    if (delegation.expiresAt <= request.nowSeconds) {
        return reject('already-expired', `delegation expired at ${delegation.expiresAt}`);
    }

    const expectedFormat: SignatureFormat = chainFamily(delegation.domain.chainId) === 'evm' ? 'eip712' : 'solana-message';
    if (request.signatureFormat !== expectedFormat) {
        return reject(
            'wrong-signature-format',
            `${delegation.domain.chainId} delegations are signed as ${expectedFormat}, got ${request.signatureFormat}`,
        );
    }
    if (!verifyDelegationSignature(delegation, request.signature, expectedFormat)) {
        return reject('bad-signature', 'signature does not recover to the delegating owner');
    }

    // Monotonic, matching `DefenseAuthorization`: bumping the nonce is how an owner
    // cancels everything signed at a lower value, so accepting a lower one would let a
    // replayed older delegation resurrect authority that was deliberately withdrawn.
    const newest = await prisma.sessionDelegation.findFirst({
        where: { chainId: delegation.domain.chainId, deploymentId: delegation.domain.deploymentId, owner: delegation.owner },
        orderBy: { revocationNonce: 'desc' },
        select: { revocationNonce: true },
    });
    if (newest && delegation.revocationNonce < newest.revocationNonce) {
        return reject(
            'stale-revocation-nonce',
            `revocationNonce ${delegation.revocationNonce} is below the current ${newest.revocationNonce}`,
        );
    }

    const delegationHash = hashSessionDelegation(delegation);
    await prisma.sessionDelegation.upsert({
        where: { delegationHash },
        // Re-submitting the same delegation is idempotent rather than an error: a client
        // that lost its response and retried should get the same answer.
        update: {},
        create: {
            delegationHash,
            chainId: delegation.domain.chainId,
            deploymentId: delegation.domain.deploymentId,
            owner: delegation.owner,
            sessionKey: delegation.sessionKey,
            scope: delegation.scope,
            notBefore: BigInt(delegation.notBefore),
            expiresAt: BigInt(delegation.expiresAt),
            revocationNonce: delegation.revocationNonce,
            signature: request.signature,
            signatureFormat: request.signatureFormat,
        },
    });

    return { ok: true, delegationHash, expiresAt: delegation.expiresAt };
}

/**
 * Whether `sessionKey` may sign battle intents for `owner` right now.
 *
 * The stored row is rebuilt into the protocol object and run through `sessionCovers`, so
 * the rule that decides this is the published one rather than a second copy of it in SQL.
 * Revocation is the part a pure function cannot know, and is the only check done here.
 */
export async function findSessionDelegation(
    chainId: ChainId,
    owner: string,
    sessionKey: string,
    nowSeconds: number,
): Promise<{ ok: true; delegationHash: string } | { ok: false; reason: string }> {
    const deploymentId = servedDeploymentId();
    const normalizedOwner = normalizeAccount(owner);
    const normalizedKey = normalizeAccount(sessionKey);

    const rows = await prisma.sessionDelegation.findMany({
        where: {
            chainId,
            deploymentId,
            owner: normalizedOwner,
            sessionKey: normalizedKey,
            revokedAt: null,
        },
        orderBy: { revocationNonce: 'desc' },
    });
    if (rows.length === 0) {
        return { ok: false, reason: 'no-delegation' };
    }

    for (const row of rows) {
        const coverage = sessionCovers(
            {
                domain: { chainId: row.chainId as ChainId, deploymentId: row.deploymentId },
                owner: row.owner,
                sessionKey: row.sessionKey,
                scope: row.scope as SessionDelegation['scope'],
                notBefore: Number(row.notBefore),
                expiresAt: Number(row.expiresAt),
                revocationNonce: row.revocationNonce,
            },
            {
                domain: { chainId, deploymentId },
                owner: normalizedOwner,
                sessionKey: normalizedKey,
                scope: 'battle-intent',
                nowSeconds,
            },
        );
        if (coverage.covered) {
            return { ok: true, delegationHash: row.delegationHash };
        }
    }
    // Rows exist but none apply, which is almost always a key whose window has closed.
    return { ok: false, reason: 'delegation-not-valid' };
}

/**
 * Revokes every delegation this wallet holds on one chain.
 *
 * Unsigned, exactly like `revokeDefenseAuthorizations` and for the same reason: the failure
 * mode of an unauthorized revocation is more wallet prompts, never fewer, and demanding a
 * signature would strand someone whose key was stolen from doing the one thing that helps.
 */
export async function revokeSessionDelegations(
    chainId: string,
    owner: string,
    revokedAt: Date,
): Promise<{ revoked: number }> {
    const { count } = await prisma.sessionDelegation.updateMany({
        where: {
            chainId,
            deploymentId: servedDeploymentId(),
            owner: normalizeAccount(owner),
            revokedAt: null,
        },
        data: { revokedAt },
    });
    return { revoked: count };
}

export function verifyDelegationSignature(
    delegation: SessionDelegation,
    signature: string,
    format: SignatureFormat,
): boolean {
    try {
        if (format === 'eip712') {
            const typed = sessionDelegationTypedData(delegation);
            const types = typed.types as unknown as Record<string, ethers.TypedDataField[]>;
            const recovered = ethers.verifyTypedData(typed.domain, types, typed.message, signature);
            return normalizeAccount(recovered) === delegation.owner;
        }
        return verifySolanaSignature(delegation.owner, signature, sessionDelegationSolanaMessage(delegation));
    } catch {
        return false;
    }
}

/** Maps the wire shape onto the protocol type, leaving validation to the protocol. */
export function toProtocolDelegation(wire: SessionDelegationWire): SessionDelegation {
    return {
        domain: { chainId: wire.chainId as ChainId, deploymentId: wire.deploymentId },
        owner: wire.owner,
        sessionKey: wire.sessionKey,
        scope: wire.scope as SessionDelegation['scope'],
        notBefore: wire.notBefore,
        expiresAt: wire.expiresAt,
        revocationNonce: wire.revocationNonce,
    };
}

function reject(reason: SessionRejection, detail: string): SubmitSessionResult {
    return { ok: false, reason, detail };
}
