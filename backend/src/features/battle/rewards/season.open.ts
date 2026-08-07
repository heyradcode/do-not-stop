import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from 'viem';

import { prisma } from '@config/prisma';

/**
 * Opening a season on chain, and refusing to open one that cannot be honoured (§I).
 *
 * The caps in `SeasonRewardDistributor` are a safety net against a bad root: they bound what
 * a mistake can cost. But a net that catches a *correct* season is not protection, it is a
 * silent injustice — the contract enforces caps per claim, first come first served, so a
 * season whose total exceeds its cap pays early claimants in full and leaves the last ones
 * with a revert they did nothing to deserve. Same for a single entitlement above the
 * per-wallet cap: that wallet can never claim, and would find out only by trying.
 *
 * So the bound is checked here, before the root is posted, where the answer is still "do not
 * open this season" rather than "some people lost". Three things must hold, and all three
 * are refusals rather than warnings:
 *
 * - every entitlement fits under the per-wallet cap;
 * - the season total fits under the season cap;
 * - the distributor actually holds enough tokens to pay the total.
 *
 * The third matters as much as the other two. Caps bound what *may* be claimed; only the
 * balance decides what *can* be, and a season opened against an underfunded distributor
 * fails in exactly the same first-come-first-served way.
 */

const ERC20_BALANCE_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
] as const;

const DISTRIBUTOR_ABI = [
    {
        type: 'function',
        name: 'openSeason',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'seasonId', type: 'uint32' },
            { name: 'merkleRoot', type: 'bytes32' },
            { name: 'token', type: 'address' },
            { name: 'perWalletCap', type: 'uint256' },
            { name: 'seasonCap', type: 'uint256' },
            { name: 'claimsOpenAt', type: 'uint64' },
            { name: 'claimsCloseAt', type: 'uint64' },
        ],
        outputs: [],
    },
] as const;

export interface OpenSeasonContext {
    publicClient: PublicClient<Transport, Chain>;
    walletClient: WalletClient<Transport, Chain, Account>;
    distributor: Address;
}

export interface OpenSeasonRequest {
    seasonId: number;
    perWalletCap: bigint;
    seasonCap: bigint;
    claimsOpenAt: bigint;
    claimsCloseAt: bigint;
}

export type OpenSeasonOutcome =
    | { status: 'opened'; txHash: string; totalAmount: bigint }
    | { status: 'season-not-built' }
    | { status: 'already-opened'; txHash: string | null }
    | { status: 'refused'; reasons: string[] };

/**
 * Validates a built season against its caps and funding, then opens it.
 *
 * Every check runs before any of them fails the call, so an operator sees every reason at
 * once rather than fixing them one transaction at a time.
 */
export async function openSeasonOnChain(
    context: OpenSeasonContext,
    request: OpenSeasonRequest,
): Promise<OpenSeasonOutcome> {
    const season = await prisma.rewardSeason.findUnique({
        where: { seasonId: request.seasonId },
        include: { entitlements: true },
    });
    if (!season) {
        return { status: 'season-not-built' };
    }
    if (season.openedAt) {
        return { status: 'already-opened', txHash: season.openedTxHash };
    }

    const totalAmount = BigInt(season.totalAmount);
    const balance = (await context.publicClient.readContract({
        address: season.token as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [context.distributor],
    })) as bigint;

    const reasons = boundsViolations({
        entitlements: season.entitlements.map((entitlement) => ({
            wallet: entitlement.wallet,
            amount: BigInt(entitlement.amount),
        })),
        totalAmount,
        balance,
        perWalletCap: request.perWalletCap,
        seasonCap: request.seasonCap,
    });
    if (reasons.length > 0) {
        return { status: 'refused', reasons };
    }

    const txHash = await context.walletClient.writeContract({
        address: context.distributor,
        abi: DISTRIBUTOR_ABI,
        functionName: 'openSeason',
        args: [
            season.seasonId,
            season.merkleRoot as `0x${string}`,
            season.token as Address,
            request.perWalletCap,
            request.seasonCap,
            request.claimsOpenAt,
            request.claimsCloseAt,
        ],
    });
    const receipt = await context.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
        return { status: 'refused', reasons: [`openSeason reverted in ${txHash}`] };
    }

    await prisma.rewardSeason.update({
        where: { seasonId: request.seasonId },
        data: { openedTxHash: txHash, openedAt: new Date() },
    });

    return { status: 'opened', txHash, totalAmount };
}

export interface BoundsCheck {
    entitlements: readonly { wallet: string; amount: bigint }[];
    totalAmount: bigint;
    balance: bigint;
    perWalletCap: bigint;
    seasonCap: bigint;
}

/**
 * Every reason this season could not be paid in full, or an empty list.
 *
 * Exported and pure so the bound can be checked without a chain — an operator can ask
 * "would this season open" against candidate caps before committing to any of them.
 */
export function boundsViolations(check: BoundsCheck): string[] {
    const reasons: string[] = [];

    const overCap = check.entitlements.filter((entitlement) => entitlement.amount > check.perWalletCap);
    if (overCap.length > 0) {
        // Naming a few rather than all: an operator needs to know it happened and where to
        // look, not to scroll past ten thousand addresses.
        const sample = overCap.slice(0, 3).map((e) => `${e.wallet}=${e.amount}`).join(', ');
        reasons.push(
            `${overCap.length} entitlement(s) exceed the per-wallet cap of ${check.perWalletCap} ` +
                `and could never be claimed (e.g. ${sample})`,
        );
    }

    if (check.totalAmount > check.seasonCap) {
        reasons.push(
            `season total ${check.totalAmount} exceeds the season cap of ${check.seasonCap}; ` +
                'claims would succeed first-come-first-served until the cap was reached',
        );
    }

    if (check.balance < check.totalAmount) {
        reasons.push(
            `distributor holds ${check.balance} but the season owes ${check.totalAmount}; ` +
                'later claims would revert once the balance ran out',
        );
    }

    return reasons;
}
