import type { Response } from 'express';

import type { AuthenticatedRequest } from '@middleware/auth';

import {
    type AuthorizationRejection,
    type DefenseAuthorizationWire,
    revokeDefenseAuthorizations,
    submitDefenseAuthorization,
} from './consent.service';
import type { SignatureFormat } from './intent.service';

const STATUS_BY_REASON: Record<AuthorizationRejection, number> = {
    'malformed-authorization': 422,
    'wrong-deployment': 422,
    'wallet-mismatch': 403,
    'wrong-signature-format': 422,
    'bad-signature': 401,
    'already-expired': 422,
    'stale-revocation-nonce': 409,
    'duplicate-authorization': 409,
};

interface SubmitBody {
    authorization?: DefenseAuthorizationWire;
    signature?: string;
    signatureFormat?: SignatureFormat;
}

export async function postDefenseAuthorization(req: AuthenticatedRequest, res: Response): Promise<void> {
    const wallet = req.user?.address;
    if (!wallet) {
        res.status(401).json({ error: 'authentication required' });
        return;
    }
    const body = req.body as SubmitBody;
    if (!body?.authorization || typeof body.signature !== 'string' || !body.signatureFormat) {
        res.status(422).json({ error: 'authorization, signature, and signatureFormat are required' });
        return;
    }

    const result = await submitDefenseAuthorization({
        authorization: body.authorization,
        signature: body.signature,
        signatureFormat: body.signatureFormat,
        authenticatedWallet: wallet,
        nowSeconds: Math.floor(Date.now() / 1000),
    });

    if (!result.ok) {
        res.status(STATUS_BY_REASON[result.reason]).json({ error: result.reason, detail: result.detail });
        return;
    }
    res.status(201).json({ authorizationHash: result.authorizationHash });
}

/**
 * Withdraws consent for the authenticated wallet on one chain.
 *
 * Takes effect immediately and needs no wallet signature: the failure mode of an
 * unauthorized revocation is fewer battles, never more, and requiring a signature would
 * leave a player who lost their signing device unable to withdraw consent.
 */
export async function deleteDefenseAuthorizations(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const { revoked } = await revokeDefenseAuthorizations(chainId, wallet, new Date());
    res.status(200).json({ revoked });
}
