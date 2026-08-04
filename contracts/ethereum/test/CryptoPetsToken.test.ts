import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, toFunctionSelector } from "viem";

/**
 * CryptoPetsToken (CPET).
 *
 * The properties worth testing here are the ones that are absent rather than present: there
 * is no mint path, no owner, and no privileged transfer. A plain ERC-20 needs no test of its
 * own — OpenZeppelin's is not this repo's job — so what is checked is that supply really is
 * fixed at construction and that nothing on the contract can change it afterwards.
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

describe("CryptoPetsToken", async function () {
    const { viem } = await network.connect();

    const SUPPLY = 100_000_000n * 10n ** 18n;

    async function deploy() {
        const [treasury, alice] = await viem.getWalletClients();
        const token = await viem.deployContract("CryptoPetsToken", [treasury.account.address, SUPPLY]);
        return { token, treasury, alice };
    }

    describe("deployment", function () {
        it("is named CPET with the usual 18 decimals", async function () {
            const { token } = await deploy();
            assert.equal(await token.read.name(), "CryptoPets");
            assert.equal(await token.read.symbol(), "CPET");
            assert.equal(await token.read.decimals(), 18);
        });

        it("mints the whole supply to the initial holder, and only there", async function () {
            const { token, treasury, alice } = await deploy();
            assert.equal(await token.read.totalSupply(), SUPPLY);
            assert.equal(await token.read.balanceOf([getAddress(treasury.account.address)]), SUPPLY);
            assert.equal(await token.read.balanceOf([getAddress(alice.account.address)]), 0n);
        });

        it("refuses to burn the supply into an unreachable address", async function () {
            await rejectsWithError(
                viem.deployContract("CryptoPetsToken", [
                    "0x0000000000000000000000000000000000000000",
                    SUPPLY,
                ]),
                "InvalidHolder()",
            );
        });

        // A zero-supply token deploys fine and then cannot fund any season; the failure
        // would surface much later, as a season refused for underfunding.
        it("refuses a zero supply rather than deploying a token that can never pay", async function () {
            await rejectsWithError(
                viem.deployContract("CryptoPetsToken", [
                    (await viem.getWalletClients())[0]!.account.address,
                    0n,
                ]),
                "InvalidSupply()",
            );
        });
    });

    describe("supply is fixed", function () {
        // The point of the whole design: §I's caps bound what a season pays, and this bounds
        // what could ever exist to pay it. Both are needed for "bounded" to mean anything.
        it("exposes no way to mint more", async function () {
            const { token } = await deploy();
            const names = token.abi
                .filter((entry) => entry.type === "function")
                .map((entry) => (entry as { name: string }).name);
            assert.ok(!names.some((n) => /mint/i.test(n)), `unexpected mint-like function: ${names.join(", ")}`);
        });

        it("has no owner or other privileged role", async function () {
            const { token } = await deploy();
            const names = token.abi
                .filter((entry) => entry.type === "function")
                .map((entry) => (entry as { name: string }).name);
            for (const forbidden of ["owner", "transferOwnership", "renounceOwnership", "pause"]) {
                assert.ok(!names.includes(forbidden), `unexpected privileged function: ${forbidden}`);
            }
        });

        it("keeps total supply constant across transfers", async function () {
            const { token, treasury, alice } = await deploy();
            await token.write.transfer([getAddress(alice.account.address), 500n], {
                account: treasury.account,
            });
            assert.equal(await token.read.totalSupply(), SUPPLY);
            assert.equal(await token.read.balanceOf([getAddress(alice.account.address)]), 500n);
        });
    });

    describe("funding a distributor", function () {
        // How a season is actually funded: the treasury moves tokens it already holds.
        it("transfers to the distributor like any other holder", async function () {
            const { token, treasury } = await deploy();
            const distributor = await viem.deployContract("SeasonRewardDistributor", [
                treasury.account.address,
            ]);

            await token.write.transfer([distributor.address, 26n * 10n ** 18n], {
                account: treasury.account,
            });

            assert.equal(await token.read.balanceOf([distributor.address]), 26n * 10n ** 18n);
            assert.equal(await token.read.totalSupply(), SUPPLY);
        });
    });
});
