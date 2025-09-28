import { expect } from "chai";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";

// Simple sleep function to replace time manipulation
const sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

describe("CryptoZombies", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();

    let cryptoZombies: any;
    let owner: any;
    let addr1: any;
    let addr2: any;

    beforeEach(async function () {
        // Get accounts from hardhat
        [owner, addr1, addr2] = walletClients;

        // Deploy the contract using hardhat
        cryptoZombies = await viem.deployContract("CryptoZombies", []);
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const ownerAddress = await cryptoZombies.read.owner();
            expect(ownerAddress.toLowerCase()).to.equal(owner.account.address.toLowerCase());
        });

        it("Should have correct name and symbol", async function () {
            expect(await cryptoZombies.read.name()).to.equal("CryptoZombies");
            expect(await cryptoZombies.read.symbol()).to.equal("ZOMBIE");
        });

        it("Should start with 0 zombies", async function () {
            expect(await cryptoZombies.read.getTotalZombies()).to.equal(0n);
        });
    });

    describe("Zombie Creation", function () {
        it("Should create a random zombie", async function () {
            await cryptoZombies.write.createRandomZombie(["TestZombie"], {
                account: addr1.account
            });

            const zombie = await cryptoZombies.read.getZombie([1n]);
            expect(zombie.name).to.equal("TestZombie");
            expect(zombie.level).to.equal(1);
            expect(zombie.winCount).to.equal(0);
            expect(zombie.lossCount).to.equal(0);
            expect(zombie.rarity).to.be.within(1, 5);
        });

        it("Should not allow creating multiple zombies for same address", async function () {
            await cryptoZombies.write.createRandomZombie(["FirstZombie"], {
                account: addr1.account
            });

            try {
                await cryptoZombies.write.createRandomZombie(["SecondZombie"], {
                    account: addr1.account
                });
                expect.fail("Expected transaction to revert");
            } catch (error: any) {
                expect(error.message).to.include("You already have a zombie!");
            }
        });

        it("Should allow different addresses to create zombies", async function () {
            await cryptoZombies.write.createRandomZombie(["Zombie1"], {
                account: addr1.account
            });
            await cryptoZombies.write.createRandomZombie(["Zombie2"], {
                account: addr2.account
            });

            expect(await cryptoZombies.read.getTotalZombies()).to.equal(2n);
            expect(await cryptoZombies.read.ownerZombieCount([addr1.account.address])).to.equal(1n);
            expect(await cryptoZombies.read.ownerZombieCount([addr2.account.address])).to.equal(1n);
        });
    });

    describe("Zombie Breeding", function () {
        beforeEach(async function () {
            await cryptoZombies.write.createRandomZombie(["Parent1"], {
                account: addr1.account
            });
            await cryptoZombies.write.createRandomZombie(["Parent2"], {
                account: addr2.account
            });

            // Skip time to make zombies ready for breeding
            await sleep(5); // 5 seconds
        });

        it("Should create zombie from two parents", async function () {
            // Transfer one zombie to addr1 for breeding
            await cryptoZombies.write.transferFrom([addr2.account.address, addr1.account.address, 2n], {
                account: addr2.account
            });

            await cryptoZombies.write.createZombieFromDNA([1n, 2n, "ChildZombie"], {
                account: addr1.account
            });

            expect(await cryptoZombies.read.getTotalZombies()).to.equal(3n);
            expect(await cryptoZombies.read.ownerZombieCount([addr1.account.address])).to.equal(2n);
        });

        it("Should not allow breeding zombie with itself", async function () {
            try {
                await cryptoZombies.write.createZombieFromDNA([1n, 1n, "ChildZombie"], {
                    account: addr1.account
                });
                expect.fail("Expected transaction to revert");
            } catch (error: any) {
                expect(error.message).to.include("Can't breed zombie with itself");
            }
        });
    });

    describe("Zombie Battles", function () {
        beforeEach(async function () {
            await cryptoZombies.write.createRandomZombie(["Fighter1"], {
                account: addr1.account
            });
            await cryptoZombies.write.createRandomZombie(["Fighter2"], {
                account: addr2.account
            });

            // Skip time to make zombies ready for battle
            await sleep(5); // 5 seconds

            // Transfer one zombie to addr1 for battle
            await cryptoZombies.write.transferFrom([addr2.account.address, addr1.account.address, 2n], {
                account: addr2.account
            });
        });

        it("Should allow zombies to battle", async function () {
            await cryptoZombies.write.battleZombies([1n, 2n], {
                account: addr1.account
            });

            // Check that one zombie won and one lost
            const zombie1 = await cryptoZombies.read.getZombie([1n]);
            const zombie2 = await cryptoZombies.read.getZombie([2n]);

            const totalWins = zombie1.winCount + zombie2.winCount;
            const totalLosses = zombie1.lossCount + zombie2.lossCount;

            expect(totalWins).to.equal(1n);
            expect(totalLosses).to.equal(1n);
        });

        it("Should not allow battling zombie with itself", async function () {
            try {
                await cryptoZombies.write.battleZombies([1n, 1n], {
                    account: addr1.account
                });
                expect.fail("Expected transaction to revert");
            } catch (error: any) {
                expect(error.message).to.include("Can't battle zombie with itself");
            }
        });
    });

    describe("Zombie Queries", function () {
        beforeEach(async function () {
            await cryptoZombies.write.createRandomZombie(["Zombie1"], {
                account: addr1.account
            });
            await cryptoZombies.write.createRandomZombie(["Zombie2"], {
                account: addr2.account
            });
        });

        it("Should return correct zombie details", async function () {
            const zombie = await cryptoZombies.read.getZombie([1n]);
            expect(zombie.name).to.equal("Zombie1");
            expect(zombie.level).to.equal(1);
        });

        it("Should return zombies by owner", async function () {
            const addr1Zombies = await cryptoZombies.read.getZombiesByOwner([addr1.account.address]);
            const addr2Zombies = await cryptoZombies.read.getZombiesByOwner([addr2.account.address]);

            expect(addr1Zombies.length).to.equal(1);
            expect(addr2Zombies.length).to.equal(1);
            expect(addr1Zombies[0]).to.equal(1n);
            expect(addr2Zombies[0]).to.equal(2n);
        });

        it("Should return correct total zombie count", async function () {
            expect(await cryptoZombies.read.getTotalZombies()).to.equal(2n);
        });
    });

    describe("Rarity System", function () {
        it("Should assign rarity between 1 and 5", async function () {
            await cryptoZombies.write.createRandomZombie(["TestZombie"], {
                account: addr1.account
            });

            const zombie = await cryptoZombies.read.getZombie([1n]);
            expect(zombie.rarity).to.be.within(1, 5);
        });
    });

    describe("Level Up System", function () {
        beforeEach(async function () {
            await cryptoZombies.write.createRandomZombie(["TestZombie"], {
                account: addr1.account
            });
        });

        it("Should allow leveling up with correct fee", async function () {
            const levelUpFee = await cryptoZombies.read.LEVEL_UP_FEE();

            await cryptoZombies.write.levelUp([1n], {
                account: addr1.account,
                value: levelUpFee
            });

            const zombie = await cryptoZombies.read.getZombie([1n]);
            expect(zombie.level).to.equal(2); // level should be 2
        });

        it("Should not allow leveling up without correct fee", async function () {
            try {
                await cryptoZombies.write.levelUp([1n], {
                    account: addr1.account,
                    value: 0n
                });
                expect.fail("Expected transaction to revert");
            } catch (error: any) {
                expect(error.message).to.include("Incorrect fee amount");
            }
        });
    });
});