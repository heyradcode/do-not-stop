import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { decodeAbiParameters, parseEventLogs } from "viem";

describe("CryptoPetsV2 (UUPS proxies)", async function () {
    const { viem } = await network.connect();

    // Fixed test randomness fed back via MockEntropy.mockReveal — the exact value
    // doesn't matter for the combat-sim/breed determinism checks below.
    const TEST_RANDOMNESS = `0x${"ab".repeat(32)}` as const;

    async function deployV2() {
        const [deployerWallet] = await viem.getWalletClients();

        // Step 1: deploy MockEntropy separately (keeps deployer initcode under EIP-3860 limit)
        const entropy = await viem.deployContract("MockEntropy", [deployerWallet.account.address]);

        // Step 2: deploy GameLogicV1's implementation separately (keeps the
        // deployer's own initcode under the EIP-3860 limit)
        const gameLogicImpl = await viem.deployContract("GameLogicV1");

        // Step 3: deploy the UUPS proxy stack
        const deployer = await viem.deployContract("LocalCryptoPetsDeployerV2", [
            entropy.address,
            gameLogicImpl.address,
        ]);
        const petCoreAddr   = await deployer.read.petCore();
        const gameLogicAddr = await deployer.read.gameLogic();

        const petCore   = await viem.getContractAt("PetCoreV1",   petCoreAddr);
        const gameLogic = await viem.getContractAt("GameLogicV1", gameLogicAddr);
        const config    = await viem.getContractAt("GameConfig",  await deployer.read.config());

        return { petCore, gameLogic, entropy, config };
    }

    // Reveals the random number for a pending entropy request, triggering
    // GameLogicV1.entropyCallback (mirrors the off-chain Pyth keeper).
    async function revealEntropy(entropy: any, requestId: bigint, account: any) {
        const provider = await entropy.read.getDefaultProvider();
        await entropy.write.mockReveal([provider, requestId, TEST_RANDOMNESS], { account });
    }

    // Helper: mint a starter pet for a wallet, computing escalating fee automatically.
    async function mintStarter(petCore: any, config: any, wallet: any, name: string) {
        const mintCount   = await petCore.read.walletMintCount([wallet.account.address]);
        const baseMintFee = await config.read.baseMintFee();
        const fee         = baseMintFee * (1n + mintCount);
        await petCore.write.mintStarter([name], { account: wallet.account, value: fee });
    }

    // Hardhat sometimes can't infer a revert reason for early-require reverts (the
    // `Error(string)` selector is buried in a nested `cause.data` instead of `message`).
    // Walk the cause chain to find and decode it.
    function decodeRevertReason(error: unknown): string {
        let e: any = error;
        while (e && !(typeof e.data === "string" && e.data.startsWith("0x08c379a0"))) {
            e = e.cause;
        }
        assert(e, "Expected a revert with an Error(string) reason");
        const [reason] = decodeAbiParameters([{ type: "string" }], `0x${e.data.slice(10)}`);
        return reason as string;
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

    it("Should reject level up with insufficient fee", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "TestPet");

        const levelUpFee = await config.read.levelUpFee();
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee - 1n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient level-up fee"));
        }
    });

    it("Should scale the level-up fee quadratically with the pet's level", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Scaler");

        const levelUpFee = await config.read.levelUpFee();

        // Level 1 -> 2: fee = levelUpFee * (100 + (1-1)^2) / 100 = levelUpFee.
        await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });

        // Level 2 -> 3: fee = levelUpFee * (100 + (2-1)^2) / 100 = levelUpFee * 101 / 100.
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient level-up fee"));
        }

        const scaledFee = levelUpFee * 101n / 100n;
        await petCore.write.levelUp([1n], { account: addr1.account, value: scaledFee });

        const [level] = await petCore.read.getPetStats([1n]);
        assert.equal(level, 3);
    });

    it("Should cap levelUp at maxLevel", async function () {
        const { petCore, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        // Set maxLevel = 1 so a freshly minted (level-1) pet is already at the cap.
        await config.write.setMaxLevel([1], { account: deployer.account });

        await mintStarter(petCore, config, addr1, "Capped");

        const levelUpFee = await config.read.levelUpFee();
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Already at max level"));
        }
    });

    it("Should battle via entropy request->store->settle", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Mine");
        await mintStarter(petCore, config, addr2, "Theirs");

        await testClient.increaseTime({ seconds: 901 }); // > battleCooldown (900s)
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

        // Step 2: entropy fulfills
        await revealEntropy(entropy, requestId, addr1.account);

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

        await testClient.increaseTime({ seconds: 901 }); // > battleCooldown (900s)
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

        await testClient.increaseTime({ seconds: 901 }); // > battleCooldown (900s)
        await testClient.mine({ blocks: 1 });

        try {
            await gameLogic.write.requestBattle([1n, 2n], { account: addr2.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Not the owner of this pet"));
        }
    });

    it("Should reject requestBattle when the level gap exceeds levelBandWidth", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [deployer, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Strong");
        await mintStarter(petCore, config, addr2, "Weak");

        // Level pet 1 up to level 12 (11 level-ups from level 1), one addXp call per level
        // since add_xp/addXp applies at most one level-up per call (plan §3.4).
        for (let level = 1; level < 12; level++) {
            await petCore.write.addXp([1n, BigInt(100 * level)], { account: deployer.account });
        }
        const pet1 = await petCore.read.getPet([1n]);
        assert.equal(pet1.level, 12);

        await testClient.increaseTime({ seconds: 901 }); // > battleCooldown (900s)
        await testClient.mine({ blocks: 1 });

        // Default levelBandWidth (100) tolerates an 11-level gap; tighten it to 10.
        await config.write.setLevelBandWidth([10], { account: deployer.account });

        try {
            await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Level gap too large"));
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

    it("Pause drill (GameLogicV1): blocks battle/breed/train but leaves withdrawals callable", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [deployer, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A"); // pet 1
        await mintStarter(petCore, config, addr2, "B"); // pet 2

        await gameLogic.write.pause({ account: deployer.account });

        // Gameplay entry points are gated by whenNotPaused as the first modifier,
        // so they revert with "Pausable: paused" regardless of cooldowns/fees.
        try {
            await gameLogic.write.train([1n], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        try {
            await gameLogic.write.requestBattle([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        try {
            await gameLogic.write.requestCreateFromDNA([1n, 2n, "X"], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        // Fee-exit paths must remain callable while paused (plan §4.3): neither
        // withdraw() nor withdrawStudFees() carries whenNotPaused.
        await gameLogic.write.withdraw({ account: deployer.account }); // does not revert

        try {
            await gameLogic.write.withdrawStudFees({ account: addr1.account });
            assert.fail("Expected revert (nothing owed)");
        } catch (error: unknown) {
            // Reverts for its own reason ("nothing owed"), not because of the pause.
            assert.equal(decodeRevertReason(error), "No stud fees to withdraw");
        }

        await gameLogic.write.unpause({ account: deployer.account });
    });

    it("Pause drill (PetCoreV1): blocks mint/levelUp/marriage/transfers but leaves withdraw callable", async function () {
        const { petCore, config } = await deployV2();
        const [deployer, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A"); // pet 1
        await mintStarter(petCore, config, addr2, "B"); // pet 2

        await petCore.write.pause({ account: deployer.account });

        const baseMintFee = await config.read.baseMintFee();
        try {
            await petCore.write.mintStarter(["C"], { account: addr1.account, value: baseMintFee });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        const levelUpFee = await config.read.levelUpFee();
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        try {
            await petCore.write.transferFrom(
                [addr1.account.address, addr2.account.address, 1n],
                { account: addr1.account }
            );
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("ERC721Pausable: token transfer while paused"));
        }

        try {
            await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        // Fee-exit path must remain callable while paused (plan §4.3): withdraw()
        // carries no whenNotPaused.
        await petCore.write.withdraw({ account: deployer.account }); // does not revert

        await petCore.write.unpause({ account: deployer.account });

        // Normal operation resumes
        await mintStarter(petCore, config, addr1, "C");
        assert.equal(await petCore.read.totalPets(), 3n);
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

    it("Should breed using Pyth Entropy with generation and lineage tracking", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        // Both parents must be owned by the same caller (plan §4.1)
        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr1, "ParentB");

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

        // Step 2: entropy fulfills (just stores the randomness)
        await revealEntropy(entropy, requestId, addr1.account);

        // Pet is NOT yet minted — need to call settleBreed
        assert.equal(await petCore.read.totalPets(), 2n);

        // Step 3: settle breeds the offspring
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });

        assert.equal(await petCore.read.totalPets(), 3n);
        assert.equal(await petCore.read.balanceOf([addr1.account.address]), 3n); // 2 parents + offspring

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
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr1, "ParentB");

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
            assert((error as Error).message.includes("Insufficient breed/entropy fee"));
        }
    });

    it("Should cancel a pending breed request before fulfillment", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr1, "ParentB");

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

        await testClient.increaseTime({ seconds: 901 }); // > battleCooldown (900s)
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

    it("Should train a pet: pay level-scaled fee, receive XP, trigger train cooldown", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Trainee");

        const pet = await petCore.read.getPet([1n]);
        const level = BigInt(pet.level);
        const baseFee = await config.read.trainFee();
        const scaledFee = baseFee * (100n + 2n * level) / 100n;

        // Should be train-ready immediately
        assert.equal(await petCore.read.isTrainReady([1n]), true);

        await gameLogic.write.train([1n], { account: addr1.account, value: scaledFee });

        const after = await petCore.read.getPet([1n]);
        // trainXp = 100; threshold = 100 * 1 = 100, so auto-levels up
        assert(after.xp === 0 && after.level === 2 || after.xp === 100, "XP or level wrong after train");

        // Train cooldown must now be active
        assert.equal(await petCore.read.isTrainReady([1n]), false);

        // After cooldown passes it resets
        const trainCooldown = await config.read.trainCooldown();
        await testClient.increaseTime({ seconds: Number(trainCooldown) + 1 });
        await testClient.mine({ blocks: 1 });
        assert.equal(await petCore.read.isTrainReady([1n]), true);
    });

    it("Should reject train when fee is insufficient", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Trainee");

        try {
            await gameLogic.write.train([1n], { account: addr1.account, value: 0n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient train fee"));
        }
    });

    it("Should reject train when train cooldown is active", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Trainee");

        const pet = await petCore.read.getPet([1n]);
        const level = BigInt(pet.level);
        const baseFee = await config.read.trainFee();
        const scaledFee = baseFee * (100n + 2n * level) / 100n;

        await gameLogic.write.train([1n], { account: addr1.account, value: scaledFee });

        try {
            await gameLogic.write.train([1n], { account: addr1.account, value: scaledFee });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Train cooldown active"));
        }
    });

    it("Should apply newborn cooldown to bred offspring (not battle cooldown)", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "ParentA");
        await mintStarter(petCore, config, addr1, "ParentB");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "NewbornPet"],
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
        await revealEntropy(entropy, requestId, addr1.account);
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });

        // Offspring is pet 3
        const newborn = await petCore.read.getPet([3n]);
        const battleCooldown = await config.read.battleCooldown();    // 5s
        const newbornCooldown = await config.read.newbornCooldown();  // 60s

        // newborn readyTime should be further in future than battleCooldown would give
        // (i.e. readyTime > block.timestamp + battleCooldown)
        assert(
            newborn.readyTime > BigInt(Math.floor(Date.now() / 1000)) + battleCooldown,
            "Newborn should have newborn cooldown, not just battle cooldown"
        );
        // Pet is not ready for battle immediately
        assert.equal(await petCore.read.isReady([3n]), false);

        // After newborn cooldown elapses, pet becomes battle-ready
        await testClient.increaseTime({ seconds: Number(newbornCooldown) + 1 });
        await testClient.mine({ blocks: 1 });
        assert.equal(await petCore.read.isReady([3n]), true);
    });

    it("Should reject breed that would exceed the generation cap", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [deployer, addr1] = await viem.getWalletClients();

        // Lower the cap to 1 so a gen-1 pet can't breed further (would produce gen-2 > cap=1)
        await config.write.setGenerationCap([1], { account: deployer.account });

        // Mint two gen-0 parents
        await mintStarter(petCore, config, addr1, "Alpha");
        await mintStarter(petCore, config, addr1, "Beta");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();

        // First breed: gen-0 + gen-0 → gen-1 (ok, gen-1 == cap)
        const req1Hash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "GenOne"],
            { account: addr1.account, value: breedFee }
        );
        const req1Receipt = await publicClient.waitForTransactionReceipt({ hash: req1Hash });
        const req1Logs = parseEventLogs({
            abi: gameLogic.abi,
            logs: req1Receipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const req1Id = req1Logs[0].args.requestId;
        await revealEntropy(entropy, req1Id, addr1.account);
        await gameLogic.write.settleBreed([req1Id], { account: addr1.account });
        // Pet 3 is now generation 1

        // Wait for parent breed cooldowns to pass
        await testClient.increaseTime({ seconds: 100 });
        await testClient.mine({ blocks: 1 });

        // Mint a fresh gen-0 pet for the second breed attempt
        await mintStarter(petCore, config, addr1, "Gamma");
        // Pet 4 is gen-0

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        // Second breed: gen-1 + gen-0 → would be gen-2, exceeds cap=1
        const req2Hash = await gameLogic.write.requestCreateFromDNA(
            [3n, 4n, "GenTwo"],
            { account: addr1.account, value: breedFee }
        );
        const req2Receipt = await publicClient.waitForTransactionReceipt({ hash: req2Hash });
        const req2Logs = parseEventLogs({
            abi: gameLogic.abi,
            logs: req2Receipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const req2Id = req2Logs[0].args.requestId;
        await revealEntropy(entropy, req2Id, addr1.account);

        try {
            await gameLogic.write.settleBreed([req2Id], { account: addr1.account });
            assert.fail("Expected revert for generation cap");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Generation cap reached"));
        }
    });

    it("Should reject breeding when caller does not own the second parent and pets are not married", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Mine");
        await mintStarter(petCore, config, addr2, "Theirs"); // addr2 owns pet 2

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        try {
            await gameLogic.write.requestCreateFromDNA(
                [1n, 2n, "Offspring"],
                { account: addr1.account, value: breedFee }
            );
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pets are not married"));
        }
    });

    it("Should reject breeding a pet with its own offspring (incest guard)", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        // Breed pet 1 + pet 2 → pet 3 (gen-1)
        await mintStarter(petCore, config, addr1, "Parent1");
        await mintStarter(petCore, config, addr1, "Parent2");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Child"],
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
        await revealEntropy(entropy, requestId, addr1.account);
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });
        // Pet 3 is child of pet 1

        // Wait for parent breed cooldowns (breedCooldownBase << 0 = 3600s for breedCount 0)
        await testClient.increaseTime({ seconds: 3601 });
        await testClient.mine({ blocks: 1 });

        // Attempt to breed parent (pet 1) with its offspring (pet 3) — should be rejected
        try {
            await gameLogic.write.requestCreateFromDNA(
                [1n, 3n, "Incest"],
                { account: addr1.account, value: breedFee }
            );
            assert.fail("Expected incest guard revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Incest"));
        }
    });

    it("Should stop granting XP once pet reaches maxLevel", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        // Set maxLevel = 2 so a level-1 pet is one level-up away from cap
        await config.write.setMaxLevel([2], { account: deployer.account });

        await mintStarter(petCore, config, addr1, "Capped");
        // Pet starts at level 1 — grant enough XP to hit maxLevel
        await petCore.write.addXp([1n, 100n], { account: deployer.account }); // level-up threshold = 100*1
        const atCap = await petCore.read.getPet([1n]);
        assert.equal(atCap.level, 2, "Should have levelled to cap");

        // Additional XP when already at cap should be silently dropped
        await petCore.write.addXp([1n, 200n], { account: deployer.account });
        const still = await petCore.read.getPet([1n]);
        assert.equal(still.level, 2, "Level must not exceed maxLevel");
        assert.equal(still.xp, 0, "XP should not accumulate past cap");
    });

    it("Should resolve and store speciesId at mint from DNA digit-pair 6 and the rarity pool size", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Speciesy");
        const pet = await petCore.read.getPet([1n]);

        const poolSize = await config.read.poolSizes([pet.rarity]);
        const expected = ((pet.dna / (10n ** 12n)) % 100n) % BigInt(poolSize);
        assert.equal(pet.speciesId, Number(expected));
    });

    it("Should default poolSizes to 8 for tiers 1-5 and store speciesId as 0 when a pool size is 0", async function () {
        const { petCore, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        for (let tier = 1; tier <= 5; tier++) {
            assert.equal(await config.read.poolSizes([tier]), 8, `tier ${tier} should default to 8`);
            await config.write.setPoolSize([tier, 0], { account: deployer.account });
        }

        await mintStarter(petCore, config, addr1, "NoSpecies");
        const pet = await petCore.read.getPet([1n]);
        assert.equal(pet.speciesId, 0, "speciesId should be 0 when the rarity tier's pool size is 0");
    });

    it("Should expose default skill config values via getSkillConfig()", async function () {
        const { config } = await deployV2();
        const sc = await config.read.getSkillConfig();

        assert.equal(sc.tankHpMult, 120);
        assert.equal(sc.shellDefMult, 125);
        assert.equal(sc.swiftCritBonus, 50);
        assert.equal(sc.cunningCritCap, 4000);
        assert.equal(sc.furyDmgMult, 130);
        assert.equal(sc.furyHpThreshold, 3000);
        assert.equal(sc.sageMdefMult, 125);
        assert.equal(sc.bloodlustBps, 150);
    });

    it("Should apply the Tank skill's pre-battle HP bonus in CombatSimV1.simulate", async function () {
        const { config } = await deployV2();
        const combatSim = await viem.getContractAt("CombatSimV1", await config.read.combatSim());
        const sc = await config.read.getSkillConfig();

        const dna1 = 1234567890123456n; // level-50 attacker, far stronger than dna2
        const dna2 = 9876543210987654n; // level-1 defender
        const seed = 42n;
        const NO_SKILL = 99; // sentinel: matches none of the 0-7 archetype branches

        const withTank = await combatSim.read.simulate([
            dna1, 1, 50, 0,        // pet1: rarity 1, level 50, Tank
            dna2, 1, 1, NO_SKILL,  // pet2: rarity 1, level 1, no skill
            seed, sc,
        ]);
        const withoutTank = await combatSim.read.simulate([
            dna1, 1, 50, NO_SKILL,
            dna2, 1, 1, NO_SKILL,
            seed, sc,
        ]);

        assert.equal(withTank.firstWins, true, "pet1 should win regardless of Tank");
        assert.equal(withoutTank.firstWins, true, "pet1 should win regardless of Tank");
        assert(
            withTank.winnerHpRemaining > withoutTank.winnerHpRemaining,
            "Tank's +20% starting HP should leave more HP remaining after an identical fight"
        );
    });

    it("Should run CombatSimV1.simulate without reverting for every skill archetype (0-7)", async function () {
        const { config } = await deployV2();
        const combatSim = await viem.getContractAt("CombatSimV1", await config.read.combatSim());
        const sc = await config.read.getSkillConfig();

        const dna1 = 1234567890123456n;
        const dna2 = 9876543210987654n;

        for (let skill = 0; skill < 8; skill++) {
            const result = await combatSim.read.simulate([
                dna1, 3, 20, skill,
                dna2, 3, 20, skill,
                BigInt(skill) + 1n,
                sc,
            ]);
            assert(result.rounds >= 1 && result.rounds <= 30, `skill ${skill}: rounds in range`);
            assert(result.winnerHpRemaining <= 65535, `skill ${skill}: winnerHpRemaining within uint16`);
        }
    });

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    it("Should propose and accept a marriage between cross-owner pets", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Alice"); // pet 1
        await mintStarter(petCore, config, addr2, "Bob");   // pet 2

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        const [propPetIdB, propProposer] = await petCore.read.marriageProposal([1n]);
        assert.equal(propPetIdB, 2n);
        assert.equal(propProposer.toLowerCase(), addr1.account.address.toLowerCase());

        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        const [spouseA, ownerSnapshotA] = await petCore.read.marriageOf([1n]);
        const [spouseB, ownerSnapshotB] = await petCore.read.marriageOf([2n]);
        assert.equal(spouseA, 2n);
        assert.equal(spouseB, 1n);
        assert.equal(ownerSnapshotA.toLowerCase(), addr1.account.address.toLowerCase());
        assert.equal(ownerSnapshotB.toLowerCase(), addr2.account.address.toLowerCase());
        assert.equal(await petCore.read.isMarriageValid([1n, 2n]), true);

        const [, propAfterProposer] = await petCore.read.marriageProposal([1n]);
        assert.equal(propAfterProposer, ZERO_ADDRESS, "proposal should be cleared after acceptance");
    });

    it("Should reject proposeMarriage when both pets share the same owner", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A");
        await mintStarter(petCore, config, addr1, "B");

        try {
            await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Same owner doesn't need marriage"));
        }
    });

    it("Should allow the proposer to cancel a pending marriage proposal", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A");
        await mintStarter(petCore, config, addr2, "B");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.cancelProposal([1n], { account: addr1.account });

        const [, propProposer] = await petCore.read.marriageProposal([1n]);
        assert.equal(propProposer, ZERO_ADDRESS);

        try {
            await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("No matching proposal"));
        }
    });

    it("Should reject acceptMarriage if the proposer transferred away petIdA (propose-then-sell guard)", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A");
        await mintStarter(petCore, config, addr2, "B");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });

        await petCore.write.transferFrom(
            [addr1.account.address, addr3.account.address, 1n],
            { account: addr1.account }
        );

        try {
            await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Proposer no longer owns petIdA"));
        }
    });

    it("Should reject proposeMarriage between a pet and its own parent/child (incest guard)", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        // Breed pet 1 + pet 2 (both owned by addr1) -> pet 3 (child)
        await mintStarter(petCore, config, addr1, "Parent1");
        await mintStarter(petCore, config, addr1, "Parent2");

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Child"],
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
        await revealEntropy(entropy, requestId, addr1.account);
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });
        // Pet 3 is child of pet 1

        // Transfer the child to addr2 so parent (pet 1) and child (pet 3) have different owners
        await petCore.write.transferFrom(
            [addr1.account.address, addr2.account.address, 3n],
            { account: addr1.account }
        );

        try {
            await petCore.write.proposeMarriage([1n, 3n], { account: addr1.account });
            assert.fail("Expected incest guard revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Incest"));
        }
    });

    it("Should divorce a marriage and apply marriageCooldown to both pets", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A");
        await mintStarter(petCore, config, addr2, "B");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        await petCore.write.divorce([1n], { account: addr1.account });

        const [spouseAAfter] = await petCore.read.marriageOf([1n]);
        const [spouseBAfter] = await petCore.read.marriageOf([2n]);
        assert.equal(spouseAAfter, 0n);
        assert.equal(spouseBAfter, 0n);

        const until1 = await petCore.read.marriageCooldownUntil([1n]);
        const until2 = await petCore.read.marriageCooldownUntil([2n]);
        assert(until1 > 0n && until2 > 0n, "marriageCooldownUntil should be set for both pets");

        // Re-proposing immediately should fail due to the active cooldown
        try {
            await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("marriage cooldown active"));
        }
    });

    it("Should clear a stale marriage after a transfer without applying marriageCooldown", async function () {
        const { petCore, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "A");
        await mintStarter(petCore, config, addr2, "B");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        // addr1 transfers pet 1 away, invalidating consent for the marriage
        await petCore.write.transferFrom(
            [addr1.account.address, addr3.account.address, 1n],
            { account: addr1.account }
        );

        assert.equal(await petCore.read.isMarriageValid([1n, 2n]), false);

        await petCore.write.clearStaleMarriage([1n, 2n], { account: addr3.account }); // permissionless

        const [spouseAAfter] = await petCore.read.marriageOf([1n]);
        const [spouseBAfter] = await petCore.read.marriageOf([2n]);
        assert.equal(spouseAAfter, 0n);
        assert.equal(spouseBAfter, 0n);
        assert.equal(
            await petCore.read.marriageCooldownUntil([1n]),
            0n,
            "stale dissolution should not apply marriageCooldown"
        );
    });

    it("Should breed cross-owner via an accepted marriage, paying breedFee + studFee", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Alice"); // pet 1
        await mintStarter(petCore, config, addr2, "Bob");   // pet 2

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const studFee  = await config.read.studFee();

        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account, value: breedFee + studFee }
        );
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        await revealEntropy(entropy, requestId, addr1.account);

        const settleHash = await gameLogic.write.settleBreed([requestId], { account: addr1.account });
        const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });
        const settleLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: settleReceipt.logs,
            eventName: "BreedSettled",
            strict: false
        });
        assert.equal(settleLogs[0].args.childId, 3n);
        assert.equal(
            (settleLogs[0].args.studFeePaidTo as string).toLowerCase(),
            addr2.account.address.toLowerCase()
        );

        // Child mints to the caller (addr1), regardless of which parent it came from
        assert.equal(
            (await petCore.read.ownerOf([3n])).toLowerCase(),
            addr1.account.address.toLowerCase()
        );

        // Stud fee is credited to the other parent's owner as a pull payment
        assert.equal(await gameLogic.read.pendingStudFees([addr2.account.address]), studFee);
    });

    it("Should reject a cross-owner breed when msg.value does not cover breedFee + studFee", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Alice");
        await mintStarter(petCore, config, addr2, "Bob");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();

        try {
            await gameLogic.write.requestCreateFromDNA(
                [1n, 2n, "Offspring"],
                { account: addr1.account, value: breedFee } // missing studFee
            );
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient breed/stud/entropy fee"));
        }
    });

    it("Should refund the escrowed stud fee when a cross-owner breed request is cancelled", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Alice");
        await mintStarter(petCore, config, addr2, "Bob");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const studFee  = await config.read.studFee();

        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account, value: breedFee + studFee }
        );
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        const contractBalanceBefore = await publicClient.getBalance({ address: gameLogic.address });

        await gameLogic.write.cancelBreed([requestId], { account: addr1.account });

        const contractBalanceAfter = await publicClient.getBalance({ address: gameLogic.address });
        assert.equal(contractBalanceBefore - contractBalanceAfter, studFee);

        // No breed, no stud fee — nothing credited to the other owner
        assert.equal(await gameLogic.read.pendingStudFees([addr2.account.address]), 0n);

        // Parents are freed and can be re-requested
        assert.equal(await gameLogic.read.petBreedRequestId([1n]), 0n);
        assert.equal(await gameLogic.read.petBreedRequestId([2n]), 0n);
    });

    it("Should let an owner withdraw credited stud fees via withdrawStudFees", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, config, addr1, "Alice");
        await mintStarter(petCore, config, addr2, "Bob");

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        await testClient.increaseTime({ seconds: 30 });
        await testClient.mine({ blocks: 1 });

        const breedFee = await config.read.breedFee();
        const studFee  = await config.read.studFee();

        const reqHash = await gameLogic.write.requestCreateFromDNA(
            [1n, 2n, "Offspring"],
            { account: addr1.account, value: breedFee + studFee }
        );
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi,
            logs: reqReceipt.logs,
            eventName: "BreedRandomnessRequested",
            strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        await revealEntropy(entropy, requestId, addr1.account);
        await gameLogic.write.settleBreed([requestId], { account: addr1.account });

        assert.equal(await gameLogic.read.pendingStudFees([addr2.account.address]), studFee);

        const contractBalanceBefore = await publicClient.getBalance({ address: gameLogic.address });

        await gameLogic.write.withdrawStudFees({ account: addr2.account });

        const contractBalanceAfter = await publicClient.getBalance({ address: gameLogic.address });
        assert.equal(contractBalanceBefore - contractBalanceAfter, studFee);
        assert.equal(await gameLogic.read.pendingStudFees([addr2.account.address]), 0n);
    });

    it("Should reject withdrawStudFees when nothing is owed", async function () {
        const { gameLogic } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        try {
            await gameLogic.write.withdrawStudFees({ account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert.equal(decodeRevertReason(error), "No stud fees to withdraw");
        }
    });
});
