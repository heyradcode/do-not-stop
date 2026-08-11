import type { Response } from 'express';

import type { AuthenticatedRequest } from '@middleware/auth';

import { acceptBattle, type AcceptRejection } from './accept.service';

/**
 * 409 for "someone already acted on this", 404/403/422 for the client's own fault, and 503 for
 * the dependencies this flow cannot proceed without (drand, the signer, a catalog that can
 * price the gear in play). A 503 is the honest answer for those: retrying shortly is the
 * correct client behaviour, and nothing about the request itself was wrong.
 *
 * A stale catalog is the odd one of the three, since retrying will not help until someone runs
 * the seeder. It is still a 503 rather than a 500: the deployment is misconfigured, not broken,
 * and a client that backs off and retries is behaving correctly either way.
 */
export const STATUS_BY_REASON: Record<AcceptRejection, number> = {
    'intent-not-found': 404,
    'intent-already-consumed': 409,
    'intent-expired': 422,
    'attacker-pet-missing': 404,
    'defender-pet-missing': 404,
    'attacker-not-ready': 409,
    'defender-not-ready': 409,
    'not-yet-valid': 409,
    expired: 409,
    'pet-not-covered': 403,
    'attacker-level-below-band': 403,
    'attacker-level-above-band': 403,
    'ruleset-mismatch': 403,
    'no-authorization': 403,
    revoked: 403,
    'daily-cap-reached': 429,
    'pet-locked': 409,
    'drand-unavailable': 503,
    'signer-unavailable': 503,
    'item-catalog-stale': 503,
    'equipment-catalog-mismatch': 503,
};

interface AcceptBody {
    intentHash?: string;
    /** The shareable room this accept call is happening through, if any (§J). */
    roomId?: string;
}

/**
 * Accepts a previously-submitted intent: freezes the snapshot, commits to a future drand
 * round, signs the commitment, and returns it in this same response. The signed commitment in
 * the response body is the player's own evidence for commit-before-reveal (§E) — the client
 * must persist it, since this is the only place it is ever handed over synchronously.
 */
export async function postAcceptBattle(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.address) {
        res.status(401).json({ error: 'authentication required' });
        return;
    }
    const body = req.body as AcceptBody;
    if (typeof body?.intentHash !== 'string') {
        res.status(422).json({ error: 'intentHash is required' });
        return;
    }

    const result = await acceptBattle({
        intentHash: body.intentHash,
        ...(typeof body.roomId === 'string' ? { roomId: body.roomId } : {}),
        nowSeconds: Math.floor(Date.now() / 1000),
    });

    if (!result.ok) {
        res.status(STATUS_BY_REASON[result.reason]).json({ error: result.reason, detail: result.detail });
        return;
    }

    res.status(201).json({
        battleId: result.battle.battleId,
        commitmentHash: result.battle.commitmentHash,
        signature: result.battle.signature,
        signingKeyId: result.battle.signingKeyId,
        commitment: serializeCommitmentForWire(result.battle.commitment),
    });
}

function serializeCommitmentForWire(commitment: unknown): unknown {
    return JSON.parse(JSON.stringify(commitment, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
}
