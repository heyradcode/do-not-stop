import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEventLogs } from "viem";

describe("CryptoPetsV2 (UUPS proxies)", async function () {
    const { viem } = await network.connect();

    async function deployV2() {
        const deployer = await viem.deployContract("LocalCryptoPetsDeployerV2", [], {
            value: 100_000_000_000_000_000_000n
        });
        const petCoreAddr   = await deployer.read.petCore();
        const gameLogicAddr = await deployer.read.gameLogic();
        const vrfAddr       = await deployer.read.vrfCoordinator();

        const petCore   = await viem.getContractAt("PetCoreV1",   petCoreAddr);
        const gameLogic = await viem.getContractAt("GameLogicV1", gameLogicAddr);
        const vrf       = await viem.getContractAt("VRFCoordinatorV2_5Mock", vrfAddr);

        return { petCore, gameLogic, vrf };
    }

    it("Should set the correct name and symbol", async function () {
        const { petCore } = await deployV2();
        assert.equal(await petCore.read.name(), "CryptoPets");
        assert.equal(await petCore.read.symbol(), "PETS");
    });

    it("Should create a pet via createRandom with rarity 1", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await petCore.write.createRandom(["TestPet"], { account: addr1.account });

        assert.equal(await petCore.read.totalPets(), 1n);
        assert.equal(await petCore.read.balanceOf([addr1.account.address]), 1n);

        const pet = await petCore.read.getPet([1n]);
        assert.equal(pet.name, "TestPet");
        assert.equal(pet.level, 1);
        assert.equal(pet.rarity, 1); // Phase-0 clamp
        assert.equal(pet.xp, 0);
    });

    it("Should reject a second pet for the same address", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await petCore.write.createRandom(["First"], { account: addr1.account });

        try {
            await petCore.write.createRandom(["Second"], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("You already have a pet!"));
        }
    });

    it("Should reject pet names that are empty or too long", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        for (const name of ["", "a".repeat(33)]) {
            try {
                await petCore.write.createRandom([name], { account: addr1.account });
                assert.fail(`Expected revert for name: "${name}"`);
            } catch (error: unknown) {
                assert((error as Error).message.includes("Invalid name length"));
            }
        }
    });

    it("Should level up pet with correct fee", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await petCore.write.createRandom(["TestPet"], { account: addr1.account });

        const configAddr = await petCore.read.gameConfig();
        const config = await viem.getContractAt("GameConfig", configAddr);
        const levelUpFee = await config.read.levelUpFee();

        await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });

        const [level] = await petCore.read.getPetStats([1n]);
        assert.equal(level, 2);
    });

    it("Should reject level up with incorrect fee", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await petCore.write.createRandom(["TestPet"], { account: addr1.account });

        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: 2000000000000000n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Incorrect fee amount"));
        }
    });

    it("Should battle via VRF request→store→settle", async function () {
        const { petCore, gameLogic, vrf } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        // Two different owners create pets
        await petCore.write.createRandom(["Mine"],   { account: addr1.account });
        await petCore.write.createRandom(["Theirs"], { account: addr2.account });

        // Fast-forward past battle cooldown
        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        // Step 1: request battle (owner of pet 1 initiates)
        const reqHash = await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BattleRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;
        assert(requestId != null, "No BattleRandomnessRequested event emitted");

        // Step 2: VRF mock fulfills (stores seed in contract)
        await vrf.write.fulfillRandomWords([requestId, gameLogic.address], {
            account: addr1.account
        });

        // Step 3: anyone settles
        const settleHash = await gameLogic.write.settleBattle([requestId], {
            account: addr1.account
        });
        const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });
        const settleLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: settleReceipt.logs,
            eventName: "BattleResolved",
            strict: false
        });
        assert.equal(settleLogs.length, 1, "Expected BattleResolved event");

        // One pet won, one lost → total win+loss across both = 2
        const [, win1, loss1] = await petCore.read.getPetStats([1n]);
        const [, win2, loss2] = await petCore.read.getPetStats([2n]);
        assert.equal(win1 + loss1 + win2 + loss2, 2);

        // Winner received XP
        const pet1 = await petCore.read.getPet([1n]);
        const pet2 = await petCore.read.getPet([2n]);
        const winnerXp = win1 > 0 ? pet1.xp : pet2.xp;
        assert(winnerXp > 0 || (win1 > 0 ? pet1.level : pet2.level) > 1,
               "Winner should have XP or levelled up");
    });

    it("Should reject battle between pets owned by the same address", async function () {
        const { petCore, gameLogic } = await deployV2();
        const testClient = await viem.getTestClient();
        const [deployer] = await viem.getWalletClients();

        // deployer (owner) creates and mints two pets to themselves
        await petCore.write.createPet(["PetA", 1234567890123456n, 1], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });
        await petCore.write.createPet(["PetB", 9876543210987654n, 1], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 2n], { account: deployer.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        try {
            await gameLogic.write.requestBattle([1n, 2n], { account: deployer.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Can't fight own pet"));
        }
    });

    it("Should reject attack with a pet the caller doesn't own", async function () {
        const { petCore, gameLogic } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await petCore.write.createRandom(["Mine"],   { account: addr1.account });
        await petCore.write.createRandom(["Theirs"], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        try {
            // addr2 tries to requestBattle using pet 1 (owned by addr1)
            await gameLogic.write.requestBattle([1n, 2n], { account: addr2.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Not the owner of this pet"));
        }
    });

    it("Should pause and block actions", async function () {
        const { petCore, gameLogic } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        await petCore.write.pause({ account: deployer.account });

        try {
            await petCore.write.createRandom(["TestPet"], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: token transfer while paused") ||
                   (error as Error).message.includes("paused"));
        }

        await petCore.write.unpause({ account: deployer.account });
        // Should succeed after unpause
        await petCore.write.createRandom(["TestPet"], { account: addr1.account });
        assert.equal(await petCore.read.totalPets(), 1n);
    });

    it("Should reject unauthorized direct calls to petCore mutators", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        try {
            await petCore.write.createPet(["Hacked", 12345n, 5], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Not authorized"));
        }
    });

    it("Should breed using Chainlink VRF mock", async function () {
        const { petCore, gameLogic, vrf } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await petCore.write.createRandom(["ParentA"], { account: addr1.account });
        await petCore.write.createRandom(["ParentB"], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account }
        );
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;
        assert(requestId != null);

        await vrf.write.fulfillRandomWords([requestId, gameLogic.address], {
            account: addr1.account
        });

        assert.equal(await petCore.read.totalPets(), 3n);
        assert.equal(await petCore.read.balanceOf([addr1.account.address]), 2n);
    });

    it("Should cancel a pending battle request before fulfillment", async function () {
        const { petCore, gameLogic } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await petCore.write.createRandom(["Mine"],   { account: addr1.account });
        await petCore.write.createRandom(["Theirs"], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const reqHash = await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BattleRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        // Pets are locked
        assert.equal(await gameLogic.read.petBattleRequestId([1n]), requestId);

        // Cancel frees the lock
        await gameLogic.write.cancelBattle([requestId], { account: addr1.account });
        assert.equal(await gameLogic.read.petBattleRequestId([1n]), 0n);

        // Pets can now be re-requested
        const reqHash2 = await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
        const rec2 = await publicClient.waitForTransactionReceipt({ hash: reqHash2 });
        assert.equal(rec2.status, "success");
    });
});
