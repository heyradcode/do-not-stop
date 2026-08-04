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

        // Step 2: deploy GameLogic's implementation separately (keeps the
        // deployer's own initcode under the EIP-3860 limit)
        const gameLogicImpl = await viem.deployContract("GameLogic");

        // Step 3: deploy the UUPS proxy stack
        const deployer = await viem.deployContract("TestDeployer", [
            entropy.address,
            gameLogicImpl.address,
        ]);
        const petCoreAddr   = await deployer.read.petCore();
        const gameLogicAddr = await deployer.read.gameLogic();

        const petCore   = await viem.getContractAt("PetCore",   petCoreAddr);
        const gameLogic = await viem.getContractAt("GameLogic", gameLogicAddr);
        const config    = await viem.getContractAt("GameConfig",  await deployer.read.config());

        return { petCore, gameLogic, entropy, config };
    }

    // Reveals the random number for a pending entropy request, triggering
    // GameLogic.entropyCallback (mirrors the off-chain Pyth keeper).
    async function revealEntropy(entropy: any, requestId: bigint, account: any) {
        const provider = await entropy.read.getDefaultProvider();
        await entropy.write.mockReveal([provider, requestId, TEST_RANDOMNESS], { account });
    }

    // Helper: sum of the current battleFee + entropyFee, i.e. the value requestBattle needs.
    async function battleValue(entropy: any, config: any) {
        const battleFee  = await config.read.battleFee();
        const entropyFee = await entropy.read.getFeeV2();
        return battleFee + entropyFee;
    }

    // Helper: mint a starter pet via the async Entropy flow (request → reveal → settle),
    // computing the escalating mint fee + entropy fee automatically.
    async function mintStarter(petCore: any, gameLogic: any, entropy: any, config: any, wallet: any, name: string) {
        const publicClient = await viem.getPublicClient();
        const mintCount   = await petCore.read.walletMintCount([wallet.account.address]);
        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();
        const fee         = baseMintFee * (1n + mintCount) + entropyFee;

        const reqHash = await gameLogic.write.requestMintStarter([name], {
            account: wallet.account, value: fee
        });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const reqLogs = parseEventLogs({
            abi: gameLogic.abi, logs: reqReceipt.logs, eventName: "MintRequested", strict: false
        });
        const requestId = reqLogs[0].args.requestId;

        await revealEntropy(entropy, requestId, wallet.account);
        await gameLogic.write.settleMint([requestId], { account: wallet.account });
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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        // First mint (count 0 → fee = baseMintFee × 1) and second (count 1 → × 2) are
        // both routed through the async Entropy flow by the mintStarter helper.
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "First");

        assert.equal(await petCore.read.totalPets(), 1n);
        assert.equal(await petCore.read.walletMintCount([addr1.account.address]), 1n);

        const pet = await petCore.read.getPet([1n]);
        assert.equal(pet.name, "First");
        assert.equal(pet.level, 1);
        assert.equal(pet.generation, 0);
        assert.equal(pet.breedCount, 0);
        assert.equal(pet.parent1Id, 0n);
        assert.equal(pet.parent2Id, 0n);

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Second");
        assert.equal(await petCore.read.totalPets(), 2n);
        assert.equal(await petCore.read.walletMintCount([addr1.account.address]), 2n);
    });

    it("Should reject requestMintStarter with insufficient fee", async function () {
        const { gameLogic, config, entropy } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();

        try {
            await gameLogic.write.requestMintStarter(["Test"], {
                account: addr1.account,
                value: baseMintFee + entropyFee - 1n  // one wei short of mint + entropy
            });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient mint/entropy fee"));
        }
    });

    it("Should reject pet names that are empty or too long", async function () {
        const { gameLogic, config, entropy } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();
        const fee = baseMintFee + entropyFee;

        for (const name of ["", "a".repeat(33)]) {
            try {
                await gameLogic.write.requestMintStarter([name], { account: addr1.account, value: fee });
                assert.fail(`Expected revert for name: "${name}"`);
            } catch (error: unknown) {
                assert((error as Error).message.includes("Invalid name length"));
            }
        }
    });

    it("Should refund the mint fee when an unfulfilled mint request is cancelled", async function () {
        const { gameLogic, config, entropy } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();

        const reqHash = await gameLogic.write.requestMintStarter(["Refundable"], {
            account: addr1.account, value: baseMintFee + entropyFee
        });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const requestId = parseEventLogs({
            abi: gameLogic.abi, logs: reqReceipt.logs, eventName: "MintRequested", strict: false
        })[0].args.requestId;

        // Only the escrowed mint fee is refundable; the entropy fee was already paid out.
        const contractBefore = await publicClient.getBalance({ address: gameLogic.address });
        await gameLogic.write.cancelMint([requestId], { account: addr1.account });
        const contractAfter = await publicClient.getBalance({ address: gameLogic.address });
        assert.equal(contractBefore - contractAfter, baseMintFee);
    });

    it("Should reject cancelMint once the request is fulfilled (no DNA re-rolling)", async function () {
        const { petCore, gameLogic, config, entropy } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const [, addr1] = await viem.getWalletClients();

        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();

        const reqHash = await gameLogic.write.requestMintStarter(["Committed"], {
            account: addr1.account, value: baseMintFee + entropyFee
        });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const requestId = parseEventLogs({
            abi: gameLogic.abi, logs: reqReceipt.logs, eventName: "MintRequested", strict: false
        })[0].args.requestId;

        // Reveal fixes the DNA. After that the requester is committed — they cannot cancel
        // and re-roll for a better rarity; settleMint is the only way forward.
        await revealEntropy(entropy, requestId, addr1.account);

        try {
            await gameLogic.write.cancelMint([requestId], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Already fulfilled - call settleMint"));
        }

        // settleMint still succeeds with the committed randomness, minting the pet.
        await gameLogic.write.settleMint([requestId], { account: addr1.account });
        assert.equal(await petCore.read.totalPets(), 1n);
        assert.equal((await petCore.read.ownerOf([1n])).toLowerCase(), addr1.account.address.toLowerCase());
    });

    it("Should level up pet with correct fee", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "TestPet");

        const levelUpFee = await config.read.levelUpFee();
        await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });

        const [level] = await petCore.read.getPetStats([1n]);
        assert.equal(level, 2);
    });

    it("Should reject level up with insufficient fee", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "TestPet");

        const levelUpFee = await config.read.levelUpFee();
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee - 1n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient level-up fee"));
        }
    });

    it("Should scale the level-up fee quadratically with the pet's level", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Scaler");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        // Set maxLevel = 1 so a freshly minted (level-1) pet is already at the cap.
        await config.write.setMaxLevel([1], { account: deployer.account });

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Capped");

        const levelUpFee = await config.read.levelUpFee();
        try {
            await petCore.write.levelUp([1n], { account: addr1.account, value: levelUpFee });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Already at max level"));
        }
    });

    it("Should pause and block actions", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        // Starter minting now lives behind GameLogic.requestMintStarter (whenNotPaused).
        await gameLogic.write.pause({ account: deployer.account });

        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();
        try {
            await gameLogic.write.requestMintStarter(["TestPet"], {
                account: addr1.account, value: baseMintFee + entropyFee
            });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: paused"));
        }

        await gameLogic.write.unpause({ account: deployer.account });
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "TestPet");
        assert.equal(await petCore.read.totalPets(), 1n);
    });

    it("Pause drill (GameLogic): blocks breed/train but leaves withdrawals callable", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [deployer, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B"); // pet 2

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

    it("Pause drill (PetCore): blocks mint/levelUp/marriage/transfers but leaves withdraw callable", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const [deployer, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B"); // pet 2

        // Request + reveal a third mint, but settle it only after (un)pausing below — the
        // token mint flows through PetCore's ERC721Pausable, so settleMint must respect it.
        const baseMintFee = await config.read.baseMintFee();
        const entropyFee  = await entropy.read.getFeeV2();
        const mintCount   = await petCore.read.walletMintCount([addr1.account.address]);
        const reqHash = await gameLogic.write.requestMintStarter(["C"], {
            account: addr1.account, value: baseMintFee * (1n + mintCount) + entropyFee
        });
        const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqHash });
        const pendingMintId = parseEventLogs({
            abi: gameLogic.abi, logs: reqReceipt.logs, eventName: "MintRequested", strict: false
        })[0].args.requestId;
        await revealEntropy(entropy, pendingMintId, addr1.account);

        await petCore.write.pause({ account: deployer.account });

        // Minting the token (settleMint → mintTo) is blocked while the core is paused.
        try {
            await gameLogic.write.settleMint([pendingMintId], { account: addr1.account });
            assert.fail("Expected revert while paused");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Pausable: token transfer while paused") ||
                   (error as Error).message.includes("paused"));
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

        // Normal operation resumes: the previously-revealed mint now settles.
        await gameLogic.write.settleMint([pendingMintId], { account: addr1.account });
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

    it("Should let the owner repoint GameLogic/PetCore at a newly deployed GameConfig", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        const freshConfig = await viem.deployContract("GameConfig", [deployer.account.address]);
        assert.notEqual(freshConfig.address.toLowerCase(), config.address.toLowerCase());

        await gameLogic.write.setGameConfig([freshConfig.address], { account: deployer.account });
        await petCore.write.setGameConfig([freshConfig.address], { account: deployer.account });

        assert.equal((await gameLogic.read.gameConfig()).toLowerCase(), freshConfig.address.toLowerCase());
        assert.equal((await petCore.read.gameConfig()).toLowerCase(), freshConfig.address.toLowerCase());

        try {
            await gameLogic.write.setGameConfig([freshConfig.address], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert.equal(decodeRevertReason(error), "Ownable: caller is not the owner");
        }

        try {
            await gameLogic.write.setGameConfig(
                ["0x0000000000000000000000000000000000000000"],
                { account: deployer.account }
            );
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert.equal(decodeRevertReason(error), "Zero address");
        }
    });

    it("Should breed using Pyth Entropy with generation and lineage tracking", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        // Both parents must be owned by the same caller (plan §4.1)
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentA");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentB");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentA");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentB");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentA");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentB");

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

    it("Should train a pet: pay level-scaled fee, receive XP, trigger train cooldown", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Trainee");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Trainee");

        try {
            await gameLogic.write.train([1n], { account: addr1.account, value: 0n });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Insufficient train fee"));
        }
    });

    it("Should reject train when train cooldown is active", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Trainee");

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

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentA");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "ParentB");

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
        const newbornCooldown = await config.read.newbornCooldown();  // 60s

        // A starter mints with readyTime 0 (battles no longer set it, §L Phase 6), so a
        // newborn's cooldown is visible as a readyTime in the future at all.
        assert(
            newborn.readyTime > BigInt(Math.floor(Date.now() / 1000)),
            "Newborn should carry the newborn cooldown"
        );
        // Pet is not ready for battle immediately. The backend honours this through the
        // indexed pet_roster.ready_at, so newborns stay barred from backend battles too.
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
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alpha");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Beta");

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
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Gamma");
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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Mine");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Theirs"); // addr2 owns pet 2

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
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Parent1");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Parent2");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        // Set maxLevel = 2 so a level-1 pet is one level-up away from cap
        await config.write.setMaxLevel([2], { account: deployer.account });

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Capped");
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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Speciesy");
        const pet = await petCore.read.getPet([1n]);

        const poolSize = await config.read.poolSizes([pet.rarity]);
        const expected = ((pet.dna / (10n ** 12n)) % 100n) % BigInt(poolSize);
        assert.equal(pet.speciesId, Number(expected));
    });

    it("Should default poolSizes to 8 for tiers 1-5 and store speciesId as 0 when a pool size is 0", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        for (let tier = 1; tier <= 5; tier++) {
            assert.equal(await config.read.poolSizes([tier]), 8, `tier ${tier} should default to 8`);
            await config.write.setPoolSize([tier, 0], { account: deployer.account });
        }

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "NoSpecies");
        const pet = await petCore.read.getPet([1n]);
        assert.equal(pet.speciesId, 0, "speciesId should be 0 when the rarity tier's pool size is 0");
    });

    it("Should expose the default skill balance values", async function () {
        // getSkillConfig() went with CombatSim (it returned that contract's struct). The
        // individual tunables remain, so the defaults are still pinned here.
        const { config } = await deployV2();

        assert.equal(await config.read.tankHpMult(), 120);
        assert.equal(await config.read.shellDefMult(), 125);
        assert.equal(await config.read.swiftCritBonus(), 50);
        assert.equal(await config.read.cunningCritCap(), 4000);
        assert.equal(await config.read.furyDmgMult(), 130);
        assert.equal(await config.read.furyHpThreshold(), 3000);
        assert.equal(await config.read.sageMdefMult(), 125);
        assert.equal(await config.read.bloodlustBps(), 150);
    });

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    it("Should propose and accept a marriage between cross-owner pets", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alice"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Bob");   // pet 2

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "B");

        try {
            await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert((error as Error).message.includes("Same owner doesn't need marriage"));
        }
    });

    it("Should allow the proposer to cancel a pending marriage proposal", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B");

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
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Parent1");
        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Parent2");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B");

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

    it("Should auto-clear a transfer-invalidated marriage when the new owner re-proposes", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B"); // pet 2

        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        // addr1 sells pet 1 to addr3 — the marriage is now stale (leftover spouseId on both).
        await petCore.write.transferFrom(
            [addr1.account.address, addr3.account.address, 1n],
            { account: addr1.account }
        );

        // New owner can re-propose without first calling clearStaleMarriage: proposeMarriage
        // dissolves the stale record automatically, then records the fresh proposal.
        await petCore.write.proposeMarriage([1n, 2n], { account: addr3.account });
        await petCore.write.acceptMarriage([1n, 2n], { account: addr2.account });

        assert.equal(await petCore.read.isMarriageValid([1n, 2n]), true);
        const [spouseA, snapA] = await petCore.read.marriageOf([1n]);
        assert.equal(spouseA, 2n);
        assert.equal(snapA.toLowerCase(), addr3.account.address.toLowerCase());
    });

    it("Should let the current owner overwrite a stale pending proposal from a prior owner", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const [, addr1, addr2, addr3] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "A"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "B"); // pet 2

        // addr1 proposes, then sells pet 1 to addr3 (proposal still keyed to pet 1).
        await petCore.write.proposeMarriage([1n, 2n], { account: addr1.account });
        await petCore.write.transferFrom(
            [addr1.account.address, addr3.account.address, 1n],
            { account: addr1.account }
        );

        // The prior owner's proposal is stale; the new owner can overwrite it.
        await petCore.write.proposeMarriage([1n, 2n], { account: addr3.account });
        const [, proposer] = await petCore.read.marriageProposal([1n]);
        assert.equal(proposer.toLowerCase(), addr3.account.address.toLowerCase());
    });

    it("Should breed cross-owner via an accepted marriage, paying breedFee + studFee", async function () {
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alice"); // pet 1
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Bob");   // pet 2

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const testClient = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alice");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Bob");

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
        const { petCore, gameLogic, entropy, config } = await deployV2();
        const publicClient = await viem.getPublicClient();
        const testClient   = await viem.getTestClient();
        const [, addr1, addr2] = await viem.getWalletClients();

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alice");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Bob");

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

        await mintStarter(petCore, gameLogic, entropy, config, addr1, "Alice");
        await mintStarter(petCore, gameLogic, entropy, config, addr2, "Bob");

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

    // ─── tokenURI base (image-generator service) ──────────────────────────────

    it("Should default tokenURI to the pre-upgrade base until an owner sets one", async function () {
        const { petCore } = await deployV2();
        const [deployer] = await viem.getWalletClients();

        await petCore.write.createPet(["Pet", 1234567890123456n, 1, 0, 0n, 0n], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });

        // An upgrade alone must not change what marketplaces already read.
        assert.equal(await petCore.read.baseTokenUri(), "https://api.cryptopets.io/metadata/");
        assert.equal(await petCore.read.tokenURI([1n]), "https://api.cryptopets.io/metadata/1");
    });

    it("Should let the owner point tokenURI at the metadata service", async function () {
        const { petCore } = await deployV2();
        const [deployer, addr1] = await viem.getWalletClients();

        await petCore.write.createPet(["Pet", 1234567890123456n, 1, 0, 0n, 0n], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });

        const base = "https://art.cryptopets.io/metadata/evm/";
        const hash = await petCore.write.setBaseTokenUri([base], { account: deployer.account });

        assert.equal(await petCore.read.tokenURI([1n]), `${base}1`);

        const receipt = await (await viem.getPublicClient()).getTransactionReceipt({ hash });
        const events = parseEventLogs({ abi: petCore.abi, logs: receipt.logs, eventName: "BaseTokenUriUpdated" });
        assert.equal(events.length, 1);
        assert.equal(events[0].args.baseUri, base);

        try {
            await petCore.write.setBaseTokenUri(["https://evil.example/"], { account: addr1.account });
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert.equal(decodeRevertReason(error), "Ownable: caller is not the owner");
        }
    });

    it("Should append the token id verbatim, so a query-style base works too", async function () {
        const { petCore } = await deployV2();
        const [deployer] = await viem.getWalletClients();

        await petCore.write.createPet(["Pet", 1234567890123456n, 1, 0, 0n, 0n], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });

        await petCore.write.setBaseTokenUri(["https://art.example/meta?id="], { account: deployer.account });
        assert.equal(await petCore.read.tokenURI([1n]), "https://art.example/meta?id=1");

        // Clearing restores the default rather than yielding a bare token id.
        await petCore.write.setBaseTokenUri([""], { account: deployer.account });
        assert.equal(await petCore.read.tokenURI([1n]), "https://api.cryptopets.io/metadata/1");
    });

    it("Should still revert tokenURI for a token that was never minted", async function () {
        const { petCore } = await deployV2();
        const [deployer] = await viem.getWalletClients();

        await petCore.write.setBaseTokenUri(["https://art.example/"], { account: deployer.account });

        try {
            await petCore.read.tokenURI([999n]);
            assert.fail("Expected revert");
        } catch (error: unknown) {
            assert.equal(decodeRevertReason(error), "Token does not exist");
        }
    });

    // _baseTokenUri took a slot off __gap rather than being appended after it. If
    // that slot had overlapped an existing variable, pet data written before the
    // write would read back corrupted — so assert both survive each other.
    it("Should not let the new base-URI slot collide with existing pet storage", async function () {
        const { petCore, gameLogic, config } = await deployV2();
        const [deployer] = await viem.getWalletClients();

        await petCore.write.createPet(["Pet", 1234567890123456n, 3, 0, 0n, 0n], { account: deployer.account });
        await petCore.write.mintTo([deployer.account.address, 1n], { account: deployer.account });

        const before = await petCore.read.getPet([1n]);

        // A long string spills past its own slot into keccak-derived storage; if the
        // layout were wrong this is what would trample a neighbouring variable.
        await petCore.write.setBaseTokenUri([`https://art.example/${"x".repeat(200)}/`], {
            account: deployer.account,
        });

        const after = await petCore.read.getPet([1n]);
        assert.equal(after.dna, before.dna);
        assert.equal(after.rarity, before.rarity);
        assert.equal(after.name, before.name);
        assert.equal(after.speciesId, before.speciesId);
        assert.equal(await petCore.read.totalPets(), 1n);

        // The variables declared immediately before _baseTokenUri, which a
        // mis-sized gap would be most likely to overwrite.
        assert.equal(await petCore.read.authorizedCallers([gameLogic.address]), true);
        assert.equal((await petCore.read.gameConfig()).toLowerCase(), config.address.toLowerCase());
        assert.equal(await petCore.read.marriageCooldownUntil([1n]), 0n);
        assert.equal((await petCore.read.owner()).toLowerCase(), deployer.account.address.toLowerCase());
    });
});
