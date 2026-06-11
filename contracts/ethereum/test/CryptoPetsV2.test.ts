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
        const config    = await viem.getContractAt("GameConfig",  await deployer.read.config());

        return { petCore, gameLogic, vrf, config };
    }

    // Helper: mint a starter pet for a wallet, computing escalating fee automatically.
    async function mintStarter(petCore: any, config: any, wallet: any, name: string) {
        const mintCount   = await petCore.read.walletMintCount([wallet.account.address]);
        const baseMintFee = await config.read.baseMintFee();
        const fee         = baseMintFee * (1n + mintCount);
        await petCore.write.mintStarter([name], { account: wallet.account, value: fee });
    }

    it("Should set the correct name and symbol", async function () {
        const { petCore } = await deployV2();
        assert.equal(await petCore.read.name(), "CryptoPets");
        assert.equal(await petCore.read.symbol(), "PETS");
    });

    it("Should mint a starter pet with escalating fee", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();

        // First mint: fee = baseMintFee * 1
        await petCore.write.mintStarter(["First"], { account: addr1.account, value: baseMintFee });

        assert.equal(await petCore.read.totalPets(), 1n);
        assert.equal(await petCore.read.walletMintCount([addr1.account.address]), 1n);

        const pet = await petCore.read.getPet([1n]);
        assert.equal(pet.name, "First");
        assert.equal(pet.level, 1);
        assert.equal(pet.generation, 0);
        assert.equal(pet.breedCount, 0);
        assert.equal(pet.parent1Id, 0n);
        assert.equal(pet.parent2Id, 0n);

        // Second mint: fee = baseMintFee * 2
        await petCore.write.mintStarter(["Second"], { account: addr1.account, value: baseMintFee * 2n });
        assert.equal(await petCore.read.totalPets(), 2n);
        assert.equal(await petCore.read.walletMintCount([addr1.account.address]), 2n);
    });

    it("Should reject mintStarter with insufficient fee", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();

        try {
            await petCore.write.mintStarter(["Test"], {
                account: addr1.account,
                value: baseMintFee - 1n  // one wei short
            });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient mint fee"));
        }
    });

    it("Should reject pet names that are empty or too long", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();

        for (const name of ["", "a".repeat(33)]) {
            try {
                await petCore.write.mintStarter([name], { account: addr1.account, value: baseMintFee });
                assert.fail(`Expected revert for name: "${name}"`);
            } catch (error: unknown) {
                assert((error as Error).message.includes("Invalid name length"));
            }
        }
    });

    it("Should level up pet with correct fee", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "TestPet");

        const levelUpFee = await config.read.levelUpFee();
        await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });

        const [level] = await petCore.read.getPetStats([1n]);
        assert.equal(level, 2);
    });

    it("Should reject level up with incorrect fee", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "TestPet");

        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: 2000000000000000n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Incorrect fee amount"));
        }
    });

    it("Should battle via VRF request->store->settle", async function () {
        const { petCore, gameLogic, vrf, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Mine");
        await mintStarter(petCore, config, addr2, "Theirs");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        // Step 1: request
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

        // Step 2: VRF fulfills
        await vrf.write.fulfillRandomWords([requestId, gameLogic.address], {
            account: addr1.account
        });

        // Step 3: settle
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

        // One pet won, one lost
        const [, win1, loss1] = await petCore.read.getPetStats([1n]);
        const [, win2, loss2] = await petCore.read.getPetStats([2n]);
        assert.equal(win1 + loss1 + win2 + loss2, 2);

        // Both pets receive XP: winner +100, loser +25 (level 1 vs 1 → xpMult = 100%)
        const pet1 = await petCore.read.getPet([1n]);
        const pet2 = await petCore.read.getPet([2n]);
        const [winner, loser] = win1 > 0 ? [pet1, pet2] : [pet2, pet1];
        // winner XP = 100 (or levelled up: 100 xp, threshold = 100 * 1 = 100, so exactly levels up)
        assert(winner.xp === 0 && winner.level === 2 || winner.xp === 100, "Winner XP/level wrong");
        // loser XP = 25
        assert.equal(loser.xp, 25);
    });

    it("Should reject battle between pets owned by the same address", async function () {
        const { petCore, gameLogic } = await deployV2();
        const testClient = await viem.getTestClient();
        const [deployer] = await viem.getWalletClients();

        // deployer (owner) creates and mints two pets to themselves
        await petCore.write.createPet(["PetA", 1234567890123456n, 1, 0, 0n, 0n], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });
        await petCore.write.createPet(["PetB", 9876543210987654n, 1, 0, 0n, 0n], { account: deployer.account });
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

    it("Should reject battle with a pet the caller does not own", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Mine");
        await mintStarter(petCore, config, addr2, "Theirs");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        try {
            await gameLogic.write.requestBattle([1n, 2n], { account: addr2.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Not the owner of this pet"));
        }
    });

    it("Should pause and block actions", async function () {
        const { petCore, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        await petCore.write.pause({ account: deployer.account });

        const baseMintFee = await config.read.baseMintFee();
        try {
            await petCore.write.mintStarter(["TestPet"], { account: addr1.account, value: baseMintFee });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: token transfer while paused") ||
                   (error as Error).message.includes("paused"));
        }

        await petCore.write.unpause({ account: deployer.account });
        await petCore.write.mintStarter(["TestPet"], { account: addr1.account, value: baseMintFee });
        assert.equal(await petCore.read.totalPets(), 1n);
    });

    it("Should reject unauthorized direct calls to petCore mutators", async function () {
        const { petCore } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        try {
            await petCore.write.createPet(["Hacked", 12345n, 5, 0, 0n, 0n], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Not authorized"));
        }
    });

    it("Should breed using Chainlink VRF with generation and lineage tracking", async function () {
        const { petCore, gameLogic, vrf, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr2, "ParentB");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account, value: breedFee }
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

        // Step 2: VRF fulfills (just stores seed, 150k gas callback)
        await vrf.write.fulfillRandomWords([requestId, gameLogic.address], {
            account: addr1.account
        });

        // Pet is NOT yet minted — need to call settleBreed
        assert.equal(await petCore.read.totalPets(), 2n);

        // Step 3: settle breeds the offspring
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });

        assert.equal(await petCore.read.totalPets(), 3n);
        assert.equal(await petCore.read.balanceOf([addr1.account.address]), 2n);

        // Offspring has generation 1 and correct parent IDs
        const [generation, breedCount, parent1Id, parent2Id] = await petCore.read.getBreedInfo([3n]);
        assert.equal(generation, 1);
        assert.equal(breedCount, 0);
        assert.equal(parent1Id, 1n);
        assert.equal(parent2Id, 2n);

        // Parents have their breedCount incremented and breed cooldown set
        const [, pBreed1] = await petCore.read.getBreedInfo([1n]);
        const [, pBreed2] = await petCore.read.getBreedInfo([2n]);
        assert.equal(pBreed1, 1);
        assert.equal(pBreed2, 1);

        // Parents battle cooldown (readyTime) is unaffected; breed cooldown (breedReadyAt) is set
        assert.equal(await petCore.read.isBreedReady([1n]), false);
        assert.equal(await petCore.read.isBreedReady([2n]), false);
        // Battle readiness may or may not be set depending on other calls — just check it exists
        const p1Info = await petCore.read.getPet([1n]);
        assert(p1Info.breedReadyAt > 0n, "breed cooldown should be set");
    });

    it("Should reject breeding with insufficient fee", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr2, "ParentB");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();

        try {
            await gameLogic.write.requestCreateFromDNA(
                [1n, 2n, "Offspring"],
                { account: addr1.account, value: breedFee - 1n }
            );
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient breed fee"));
        }
    });

    it("Should cancel a pending breed request before fulfillment", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr2, "ParentB");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account, value: breedFee }
        );
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        // Parents are locked
        assert.equal(await gameLogic.read.petBreedRequestId([1n]), requestId);

        // Cancel frees the lock
        await gameLogic.write.cancelBreed([requestId], { account: addr1.account });
        assert.equal(await gameLogic.read.petBreedRequestId([1n]), 0n);

        // Can re-request immediately
        const reqHash2 = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Retry"],
            { account: addr1.account, value: breedFee }
        );
        const rec2 = await publicClient.waitForTransactionReceipt({ hash: reqHash2 });
        assert.equal(rec2.status, "success");
    });

    it("Should cancel a pending battle request before fulfillment", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Mine");
        await mintStarter(petCore, config, addr2, "Theirs");

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

        // Pets can be re-requested
        const reqHash2 = await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
        const rec2 = await publicClient.waitForTransactionReceipt({ hash: reqHash2 });
        assert.equal(rec2.status, "success");
    });
});
