import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("CryptoZombies", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();

    it("Should set the correct name and symbol", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");

        assert.equal(await cryptoZombies.read.name(), "CryptoZombies");
        assert.equal(await cryptoZombies.read.symbol(), "ZOMBIE");
    });

    it("Should create a zombie successfully", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");
        const [owner, addr1] = await viem.getWalletClients();

        await cryptoZombies.write.createRandomZombie(["TestZombie"], { account: addr1.account });

        assert.equal(await cryptoZombies.read.getTotalZombiesCount(), 1n);
        assert.equal(await cryptoZombies.read.balanceOf([addr1.account.address]), 1n);
        assert.equal(await cryptoZombies.read.ownerZombieCount([addr1.account.address]), 1n);
    });

    it("Should not allow creating multiple zombies for same address", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");
        const [owner, addr1] = await viem.getWalletClients();

        await cryptoZombies.write.createRandomZombie(["TestZombie1"], { account: addr1.account });

        try {
            await cryptoZombies.write.createRandomZombie(["TestZombie2"], { account: addr1.account });
            assert.fail("Expected transaction to revert");
        } catch (error: any) {
            assert(error.message.includes("You already have a zombie!"));
        }
    });

    it("Should return correct zombie data", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");
        const [owner, addr1] = await viem.getWalletClients();

        await cryptoZombies.write.createRandomZombie(["TestZombie"], { account: addr1.account });

        const zombie = await cryptoZombies.read.getZombie([1n]);

        assert.equal(zombie.name, "TestZombie");
        assert.equal(zombie.level, 1);
        assert.equal(zombie.winCount, 0);
        assert.equal(zombie.lossCount, 0);
    });

    it("Should level up zombie with correct fee", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");
        const [owner, addr1] = await viem.getWalletClients();

        await cryptoZombies.write.createRandomZombie(["TestZombie"], { account: addr1.account });

        const levelUpFee = await cryptoZombies.read.LEVEL_UP_FEE();

        await cryptoZombies.write.levelUp([1n], {
            account: addr1.account,
            value: levelUpFee
        });

        const [level] = await cryptoZombies.read.getZombieStats([1n]);
        assert.equal(level, 2);
    });

    it("Should reject level up with incorrect fee", async function () {
        const cryptoZombies = await viem.deployContract("CryptoZombies");
        const [owner, addr1] = await viem.getWalletClients();

        await cryptoZombies.write.createRandomZombie(["TestZombie"], { account: addr1.account });

        try {
            await cryptoZombies.write.levelUp([1n], {
                account: addr1.account,
                value: 2000000000000000n // 0.002 ETH
            });
            assert.fail("Expected transaction to revert");
        } catch (error: any) {
            assert(error.message.includes("Incorrect fee amount"));
        }
    });
});