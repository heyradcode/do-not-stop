import { normalizeAccount } from '@cryptopets/protocol';

/**
 * Turning anchored battles into per-wallet entitlements (§I).
 *
 * **The rates are inputs, not a formula this file decides.** How much a battle is worth,
 * and whether winning pays more than losing, is a game-design question that depends on
 * token supply, season length, and what the rewardless launch actually shows — §L defers it
 * deliberately, and inventing an answer here would bake a product decision into
 * infrastructure. What this file owns is the mechanism: attribute each battle to the
 * wallets that fought it, apply the per-battle cap §I requires, and aggregate.
 *
 * The per-battle cap is applied here rather than on chain because this is where battles are
 * visible. The contract only ever sees a wallet and a total, so it can bound a wallet and a
 * season but not a single fight; those are complementary limits, not duplicates.
 */

export interface RewardRates {
    /** Paid to the winner of a battle. */
    perWin: bigint;
    /** Paid to the loser. Non-zero keeps participation from being punished. */
    perLoss: bigint;
    /**
     * Most any single battle may contribute to one wallet, before aggregation.
     *
     * The bound that survives a bug in the rates: with it, an absurd `perWin` inflates one
     * battle to the cap rather than to whatever the mistake produced.
     */
    perBattleCap: bigint;
}

/** One battle's contribution, as read from an anchored receipt. */
export interface BattleContribution {
    attackerOwner: string;
    defenderOwner: string;
    attackerWon: boolean;
}

export interface WalletEntitlement {
    wallet: string;
    amount: bigint;
    breakdown: { battles: number; wins: number; losses: number; capped: number };
}

/**
 * Aggregates contributions into one entitlement per wallet, sorted by wallet.
 *
 * Sorted because the leaf order defines the tree, and a tree that depended on the order rows
 * came back from a database would not be reproducible by anyone else from the same corpus.
 * Reproducibility is the whole claim: a player should be able to rebuild the root and check
 * that their entitlement is what we said it was.
 *
 * A wallet fighting itself is counted once as a win and once as a loss, which is what
 * actually happened — the battle had two sides and this wallet was both.
 */
export function computeEntitlements(
    contributions: readonly BattleContribution[],
    rates: RewardRates,
): WalletEntitlement[] {
    assertRates(rates);
    const byWallet = new Map<string, WalletEntitlement>();

    for (const battle of contributions) {
        const winner = battle.attackerWon ? battle.attackerOwner : battle.defenderOwner;
        const loser = battle.attackerWon ? battle.defenderOwner : battle.attackerOwner;
        credit(byWallet, winner, rates.perWin, rates.perBattleCap, true);
        credit(byWallet, loser, rates.perLoss, rates.perBattleCap, false);
    }

    return [...byWallet.values()].sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
}

function credit(
    byWallet: Map<string, WalletEntitlement>,
    account: string,
    reward: bigint,
    perBattleCap: bigint,
    won: boolean,
): void {
    const wallet = normalizeAccount(account);
    const capped = reward > perBattleCap;
    const applied = capped ? perBattleCap : reward;

    const existing = byWallet.get(wallet) ?? {
        wallet,
        amount: 0n,
        breakdown: { battles: 0, wins: 0, losses: 0, capped: 0 },
    };
    existing.amount += applied;
    existing.breakdown.battles += 1;
    if (won) existing.breakdown.wins += 1;
    else existing.breakdown.losses += 1;
    if (capped) existing.breakdown.capped += 1;
    byWallet.set(wallet, existing);
}

function assertRates(rates: RewardRates): void {
    for (const [field, value] of Object.entries(rates)) {
        if (typeof value !== 'bigint' || value < 0n) {
            throw new Error(`reward rate ${field} must be a non-negative bigint, got ${String(value)}`);
        }
    }
}

/** Sum of every entitlement, which must fit inside the on-chain season cap. */
export function totalEntitled(entitlements: readonly WalletEntitlement[]): bigint {
    return entitlements.reduce((sum, entitlement) => sum + entitlement.amount, 0n);
}
