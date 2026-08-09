import type { Request, Response } from 'express';

import {
    getBattleConfig,
    getBattleStateSummary,
    getCombatLog,
    getRuleset,
    getSignedCommitment,
    getSignedReceipt,
    listActiveSigningKeys,
    listRulesets,
    verifyReceiptSignature,
} from './reads.service';

/** The deployment, chains, and active ruleset a client needs before it can sign an intent. */
export async function getBattleConfigHandler(_req: Request, res: Response): Promise<void> {
    try {
        res.status(200).json(await getBattleConfig());
    } catch (err) {
        // Async since the ruleset now joins the item catalog (roadmap §4), so this can
        // fail on a database that is down. A 500 is right: a client that signed against a
        // guessed ruleset hash would have every battle rejected.
        console.error('[battle] failed to read battle config:', err);
        res.status(500).json({ error: 'config-unavailable' });
    }
}

export async function getBattleStateHandler(req: Request, res: Response): Promise<void> {
    const summary = await getBattleStateSummary(req.params.battleId as string);
    if (!summary) {
        res.status(404).json({ error: 'battle-not-found' });
        return;
    }
    res.status(200).json(summary);
}

export async function getBattleCommitment(req: Request, res: Response): Promise<void> {
    const commitment = await getSignedCommitment(req.params.battleId as string);
    if (!commitment) {
        res.status(404).json({ error: 'commitment-not-found' });
        return;
    }
    res.status(200).json(commitment);
}

export async function getBattleReceipt(req: Request, res: Response): Promise<void> {
    const receipt = await getSignedReceipt(req.params.battleId as string);
    if (!receipt) {
        res.status(404).json({ error: 'receipt-not-found' });
        return;
    }
    res.status(200).json(receipt);
}

export async function getBattleCombatLog(req: Request, res: Response): Promise<void> {
    const log = await getCombatLog(req.params.battleId as string);
    if (!log) {
        res.status(404).json({ error: 'combat-log-not-found' });
        return;
    }
    res.status(200).json(log);
}

export function getSigningKeys(_req: Request, res: Response): void {
    res.status(200).json({ keys: listActiveSigningKeys() });
}

export async function getRulesets(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ rulesets: await listRulesets() });
}

export async function getRulesetByHash(req: Request, res: Response): Promise<void> {
    const ruleset = await getRuleset(req.params.rulesetHash as string);
    if (!ruleset) {
        res.status(404).json({ error: 'ruleset-not-found' });
        return;
    }
    res.status(200).json(ruleset);
}

interface VerifyReceiptBody {
    receiptHash?: string;
}

export async function postVerifyReceipt(req: Request, res: Response): Promise<void> {
    const body = req.body as VerifyReceiptBody;
    if (typeof body?.receiptHash !== 'string') {
        res.status(422).json({ error: 'receiptHash is required' });
        return;
    }
    const result = await verifyReceiptSignature(body.receiptHash);
    res.status(result.ok ? 200 : 422).json(result);
}
