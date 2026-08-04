import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMerkleTree, merkleProof, rewardMerkleLeaf } from "@cryptopets/protocol";
import { network } from "hardhat";
import { toFunctionSelector } from "viem";

/**
 * SeasonRewardDistributor (docs/plan-backend-battle-architecture.md §I).
 *
 * Two things are being tested. First, that the Solidity leaf encoding is byte-identical to
 * the protocol's `rewardMerkleLeaf` — if it is not, no proof the backend ever builds will
 * verify, and every other test here would pass against a tree only Solidity can produce.
 * Second, that the caps and the nullifier hold even when the posted root is wrong, since a
 * root is operator-supplied and treating it as authoritative for value would make a bad
 * root an unbounded loss.
 */
async function rejectsWithError(promise: Promise<unknown>, signature: string): Promise<void> {
    const name = signature.slice(0, signature.indexOf("("));
    const selector = toFunctionSelector(signature);
    await assert.rejects(promise, (error: unknown) => {
        const text = String(error);
        assert.ok(
            text.includes(name) || text.includes(selector),
            `expected a revert with ${signature} (${selector}), got:\n${text}`,
        );
        return true;
    });
}

describe("SeasonRewardDistributor", async function () {
    const { viem } = await network.connect();

    const SEASON = 1;
    const PER_WALLET_CAP = 1000n;
    const SEASON_CAP = 2500n;
    const FAR_FUTURE = 4_000_000_000n;

    async function deploy() {
        const [owner, alice, bob, carol] = await viem.getWalletClients();
        const token = await viem.deployContract("MockERC20", ["Reward", "RWD"]);
        const distributor = await viem.deployContract("SeasonRewardDistributor", [owner.account.address]);
        await token.write.mint([distributor.address, 100_000n]);
        const publicClient = await viem.getPublicClient();
        return { distributor, token, owner, alice, bob, carol, publicClient };
    }

    /** Builds the reward tree with the protocol, exactly as the backend would. */
    function buildTree(
        distributor: `0x${string}`,
        token: `0x${string}`,
        chainId: number,
        entries: { wallet: `0x${string}`; amount: bigint }[],
    ) {
        const leaves = entries.map((entry) =>
            rewardMerkleLeaf({
                chainId,
                distributor,
                seasonId: SEASON,
                wallet: entry.wallet,
                token,
                amount: entry.amount,
            }),
        );
        const tree = buildMerkleTree(leaves);
        return {
            root: tree.root,
            proofFor: (index: number) => merkleProof(tree, index),
        };
    }

    async function openSeasonWith(
        entries: { wallet: `0x${string}`; amount: bigint }[],
        overrides: { perWalletCap?: bigint; seasonCap?: bigint; opensAt?: bigint; closesAt?: bigint } = {},
    ) {
        const ctx = await deploy();
        const chainId = await ctx.publicClient.getChainId();
        const tree = buildTree(ctx.distributor.address, ctx.token.address, chainId, entries);
        await ctx.distributor.write.openSeason([
            SEASON,
            tree.root,
            ctx.token.address,
            overrides.perWalletCap ?? PER_WALLET_CAP,
            overrides.seasonCap ?? SEASON_CAP,
            overrides.opensAt ?? 0n,
            overrides.closesAt ?? FAR_FUTURE,
        ]);
        return { ...ctx, tree, chainId };
    }

    describe("leaf encoding matches the protocol", () => {
        it("computes the same leaf Solidity and TypeScript do", async () => {
            // The check everything else depends on. A mismatch here means the backend's
            // trees and this contract's proofs describe different sets entirely.
            const { distributor, token, alice, publicClient } = await deploy();
            const chainId = await publicClient.getChainId();

            const onChain = await distributor.read.rewardLeaf([SEASON, alice.account.address, token.address, 777n]);
            const offChain = rewardMerkleLeaf({
                chainId,
                distributor: distributor.address,
                seasonId: SEASON,
                wallet: alice.account.address,
                token: token.address,
                amount: 777n,
            });

            assert.equal(onChain.toLowerCase(), offChain.toLowerCase());
        });

        it("binds this contract's own address, not one a caller supplies", async () => {
            const { distributor, token, alice } = await deploy();
            const elsewhere = await distributor.read.rewardLeafFor([
                1n,
                "0x9999999999999999999999999999999999999999",
                SEASON,
                alice.account.address,
                token.address,
                777n,
            ]);
            const here = await distributor.read.rewardLeaf([SEASON, alice.account.address, token.address, 777n]);
            assert.notEqual(elsewhere, here);
        });

        it("agrees with the protocol on the domain tag", async () => {
            const { distributor } = await deploy();
            const { MERKLE_REWARD_LEAF_DOMAIN } = await import("@cryptopets/protocol");
            assert.equal((await distributor.read.REWARD_LEAF_DOMAIN()).toLowerCase(), MERKLE_REWARD_LEAF_DOMAIN);
        });
    });

    describe("claiming", () => {
        it("pays a valid claim and marks it claimed", async () => {
            const { distributor, token, alice, tree } = await openSeasonWith([
                { wallet: (await viem.getWalletClients())[1]!.account.address, amount: 500n },
            ]);

            await distributor.write.claim([SEASON, alice.account.address, 500n, tree.proofFor(0)]);

            assert.equal(await token.read.balanceOf([alice.account.address]), 500n);
            assert.equal(await distributor.read.hasClaimed([SEASON, alice.account.address]), true);
        });

        it("proves membership in a multi-entry tree", async () => {
            const [, alice, bob, carol] = await viem.getWalletClients();
            const entries = [
                { wallet: alice.account.address, amount: 100n },
                { wallet: bob.account.address, amount: 200n },
                { wallet: carol.account.address, amount: 300n },
            ];
            const { distributor, token, tree } = await openSeasonWith(entries);

            await distributor.write.claim([SEASON, bob.account.address, 200n, tree.proofFor(1)]);

            assert.equal(await token.read.balanceOf([bob.account.address]), 200n);
        });

        it("lets anyone pay the gas without being able to redirect the reward", async () => {
            // The leaf binds the beneficiary, so sponsored claims are possible and theft is
            // not.
            const [, alice, bob] = await viem.getWalletClients();
            const { distributor, token, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 400n }]);

            await distributor.write.claim([SEASON, alice.account.address, 400n, tree.proofFor(0)], {
                account: bob.account,
            });

            assert.equal(await token.read.balanceOf([alice.account.address]), 400n);
            assert.equal(await token.read.balanceOf([bob.account.address]), 0n);
        });

        it("refuses a second claim by the same wallet", async () => {
            const [, alice] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 500n }]);
            await distributor.write.claim([SEASON, alice.account.address, 500n, tree.proofFor(0)]);

            await rejectsWithError(
                distributor.write.claim([SEASON, alice.account.address, 500n, tree.proofFor(0)]),
                "AlreadyClaimed()",
            );
        });

        it("refuses a proof for a different amount than the leaf committed to", async () => {
            const [, alice] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 500n }]);

            await rejectsWithError(
                distributor.write.claim([SEASON, alice.account.address, 501n, tree.proofFor(0)]),
                "BadProof()",
            );
        });

        it("refuses a wallet that is not in the tree", async () => {
            const [, alice, bob] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 500n }]);

            await rejectsWithError(
                distributor.write.claim([SEASON, bob.account.address, 500n, tree.proofFor(0)]),
                "BadProof()",
            );
        });

        it("refuses a claim against an unknown season", async () => {
            const { distributor, alice, tree } = await openSeasonWith([
                { wallet: (await viem.getWalletClients())[1]!.account.address, amount: 500n },
            ]);
            await rejectsWithError(
                distributor.write.claim([99, alice.account.address, 500n, tree.proofFor(0)]),
                "SeasonUnknown()",
            );
        });
    });

    describe("caps bound the damage a bad root can do", () => {
        it("refuses an entitlement above the per-wallet cap", async () => {
            // A root is operator-supplied. The cap is what makes a bad one recoverable.
            const [, alice] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 5000n }]);

            await rejectsWithError(
                distributor.write.claim([SEASON, alice.account.address, 5000n, tree.proofFor(0)]),
                "ExceedsWalletCap(uint256,uint256)",
            );
        });

        it("refuses once the season total would be exceeded", async () => {
            const [, alice, bob, carol] = await viem.getWalletClients();
            const entries = [
                { wallet: alice.account.address, amount: 1000n },
                { wallet: bob.account.address, amount: 1000n },
                { wallet: carol.account.address, amount: 1000n },
            ];
            const { distributor, tree } = await openSeasonWith(entries, { seasonCap: 2500n });

            await distributor.write.claim([SEASON, alice.account.address, 1000n, tree.proofFor(0)]);
            await distributor.write.claim([SEASON, bob.account.address, 1000n, tree.proofFor(1)]);

            // 2000 paid, 500 left, third wallet wants 1000.
            await rejectsWithError(
                distributor.write.claim([SEASON, carol.account.address, 1000n, tree.proofFor(2)]),
                "ExceedsSeasonCap(uint256,uint256)",
            );
        });

        it("tracks the running total across claims", async () => {
            const [, alice, bob] = await viem.getWalletClients();
            const entries = [
                { wallet: alice.account.address, amount: 300n },
                { wallet: bob.account.address, amount: 400n },
            ];
            const { distributor, tree } = await openSeasonWith(entries);

            await distributor.write.claim([SEASON, alice.account.address, 300n, tree.proofFor(0)]);
            await distributor.write.claim([SEASON, bob.account.address, 400n, tree.proofFor(1)]);

            assert.equal((await distributor.read.getSeason([SEASON])).totalClaimed, 700n);
        });
    });

    describe("seasons are immutable once opened", () => {
        it("refuses to reopen a season", async () => {
            // Re-posting a root would let entitlements be rewritten after people read them
            // — the most valuable thing a compromised owner key could do.
            const { distributor, token, tree } = await openSeasonWith([
                { wallet: (await viem.getWalletClients())[1]!.account.address, amount: 100n },
            ]);

            await rejectsWithError(
                distributor.write.openSeason([SEASON, tree.root, token.address, 1n, 1n, 0n, FAR_FUTURE]),
                "SeasonAlreadyOpen()",
            );
        });

        it("refuses an empty root", async () => {
            const { distributor, token } = await deploy();
            await rejectsWithError(
                distributor.write.openSeason([SEASON, `0x${"00".repeat(32)}`, token.address, 1n, 1n, 0n, FAR_FUTURE]),
                "EmptyRoot()",
            );
        });

        it("refuses a window that closes before it opens", async () => {
            const { distributor, token } = await deploy();
            await rejectsWithError(
                distributor.write.openSeason([SEASON, `0x${"11".repeat(32)}`, token.address, 1n, 1n, 100n, 50n]),
                "BadClaimWindow()",
            );
        });

        it("only the owner may open a season", async () => {
            const { distributor, token, alice } = await deploy();
            await rejectsWithError(
                distributor.write.openSeason([SEASON, `0x${"11".repeat(32)}`, token.address, 1n, 1n, 0n, FAR_FUTURE], {
                    account: alice.account,
                }),
                "OwnableUnauthorizedAccount(address)",
            );
        });
    });

    describe("claim window", () => {
        it("refuses a claim before the window opens", async () => {
            const [, alice] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 100n }], {
                opensAt: FAR_FUTURE - 1n,
                closesAt: FAR_FUTURE,
            });

            await rejectsWithError(
                distributor.write.claim([SEASON, alice.account.address, 100n, tree.proofFor(0)]),
                "ClaimsNotOpen()",
            );
        });

        it("refuses to sweep while claims are still open", async () => {
            // Otherwise the owner could pull funds out from under people still entitled.
            const { distributor, owner } = await openSeasonWith([
                { wallet: (await viem.getWalletClients())[1]!.account.address, amount: 100n },
            ]);

            await rejectsWithError(
                distributor.write.sweepUnclaimed([SEASON, owner.account.address]),
                "ClaimsStillOpen()",
            );
        });
    });

    describe("emergency pause", () => {
        it("stops claims while paused", async () => {
            const [, alice] = await viem.getWalletClients();
            const { distributor, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 100n }]);
            await distributor.write.pause();

            await rejectsWithError(
                distributor.write.claim([SEASON, alice.account.address, 100n, tree.proofFor(0)]),
                "EnforcedPause()",
            );
        });

        it("resumes without losing anything", async () => {
            const [, alice] = await viem.getWalletClients();
            const { distributor, token, tree } = await openSeasonWith([{ wallet: alice.account.address, amount: 100n }]);

            await distributor.write.pause();
            await distributor.write.unpause();
            await distributor.write.claim([SEASON, alice.account.address, 100n, tree.proofFor(0)]);

            assert.equal(await token.read.balanceOf([alice.account.address]), 100n);
        });

        it("only the owner may pause", async () => {
            const { distributor, alice } = await deploy();
            await rejectsWithError(distributor.write.pause({ account: alice.account }), "OwnableUnauthorizedAccount(address)");
        });
    });

    describe("nullifiers", () => {
        it("differs per wallet and per season", async () => {
            const { distributor, alice, bob } = await deploy();
            const a1 = await distributor.read.claimNullifier([SEASON, alice.account.address]);
            const b1 = await distributor.read.claimNullifier([SEASON, bob.account.address]);
            const a2 = await distributor.read.claimNullifier([2, alice.account.address]);

            assert.notEqual(a1, b1);
            assert.notEqual(a1, a2);
        });

        it("reports unclaimed before a claim", async () => {
            const { distributor, alice } = await deploy();
            assert.equal(await distributor.read.hasClaimed([SEASON, alice.account.address]), false);
        });
    });
});
