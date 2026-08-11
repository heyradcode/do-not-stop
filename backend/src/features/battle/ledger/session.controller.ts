import type { Response } from 'express';

import type { AuthenticatedRequest } from '@middleware/auth';

import type { SignatureFormat } from './intent.service';
import {
    revokeSessionDelegations,
    type SessionDelegationWire,
    type SessionRejection,
    submitSessionDelegation,
} from './session.service';

/**
 * Delegated battle-intent signing (§D).
 *
 * The owner approves a client-held key once; that key then signs intents, so the wallet
 * prompt stops being per battle. What it does not change is who authorizes a battle: the
 * key is generated and held by the client, so the operator still cannot produce an intent,
 * which is the property that ruled out authorizing from a JWT in the first place.
 */

const STATUS_BY_REASON: Record<SessionRejection, number> = {
    'malformed-delegation': 422,
    'wrong-deployment': 422,
    'wallet-mismatch': 403,
    'wrong-signature-format': 422,
    'bad-signature': 401,
    'already-expired': 422,
    'stale-revocation-nonce': 409,
};

interface SubmitBody {
    delegation?: SessionDelegationWire;
    signature?: string;
    signatureFormat?: SignatureFormat;
}

export async function postSessionDelegation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const wallet = req.user?.address;
    if (!wallet) {
        res.status(401).json({ error: 'authentication required' });
        return;
    }
    const body = req.body as SubmitBody;
    if (!body?.delegation || typeof body.signature !== 'string' || !body.signatureFormat) {
        res.status(422).json({ error: 'delegation, signature, and signatureFormat are required' });
        return;
    }

    const result = await submitSessionDelegation({
        delegation: body.delegation,
        signature: body.signature,
        signatureFormat: body.signatureFormat,
        authenticatedWallet: wallet,
        nowSeconds: Math.floor(Date.now() / 1000),
    });

    if (!result.ok) {
        res.status(STATUS_BY_REASON[result.reason]).json({ error: result.reason, detail: result.detail });
        return;
    }
    res.status(201).json({ delegationHash: result.delegationHash, expiresAt: result.expiresAt });
}

/**
 * Revokes every session key this wallet has approved on one chain.
 *
 * Unsigned, like consent revocation and for the same reason: the failure mode of an
 * unauthorized revocation is more wallet prompts, never fewer. Demanding a signature would
 * strand exactly the person who most needs this — someone whose key was stolen.
 */
export async function deleteSessionDelegations(req: AuthenticatedRequest, res: Response): Promise<void> {
    const wallet = req.user?.address;
    if (!wallet) {
        res.status(401).json({ error: 'authentication required' });
        return;
    }
    const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : undefined;
    if (!chainId) {
        res.status(422).json({ error: 'chainId is required' });
        return;
    }

    const { revoked } = await revokeSessionDelegations(chainId, wallet, new Date());
    res.status(200).json({ revoked });
}
