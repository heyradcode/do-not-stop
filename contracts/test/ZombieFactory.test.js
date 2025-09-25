import { expect } from "chai";
import { ethers } from "hardhat";

describe("ZombieFactory", function () {
    let zombieFactory;
    let owner;
    let addr1;
    let addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        const ZombieFactory = await ethers.getContractFactory("ZombieFactory");
        zombieFactory = await ZombieFactory.deploy();
        await zombieFactory.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await zombieFactory.owner()).to.equal(owner.address);
        });

        it("Should have correct name and symbol", async function () {
            expect(await zombieFactory.name()).to.equal("CryptoZombies");
            expect(await zombieFactory.symbol()).to.equal("ZOMBIE");
        });

        it("Should start with 0 zombies", async function () {
            expect(await zombieFactory.getTotalZombies()).to.equal(0);
        });
    });

    describe("Zombie Creation", function () {
        it("Should create a random zombie", async function () {
            const tx = await zombieFactory.connect(addr1).createRandomZombie("TestZombie");
            await expect(tx)
                .to.emit(zombieFactory, "NewZombie")
                .withArgs(1, "TestZombie", await zombieFactory.zombies(1).then(z => z.dna), await zombieFactory.zombies(1).then(z => z.rarity));

            const zombie = await zombieFactory.getZombie(1);
            expect(zombie.name).to.equal("TestZombie");
            expect(zombie.level).to.equal(1);
            expect(zombie.winCount).to.equal(0);
            expect(zombie.lossCount).to.equal(0);
            expect(zombie.rarity).to.be.within(1, 5);
        });

        it("Should not allow creating multiple zombies for same address", async function () {
            await zombieFactory.connect(addr1).createRandomZombie("FirstZombie");

            await expect(
                zombieFactory.connect(addr1).createRandomZombie("SecondZombie")
            ).to.be.revertedWith("You already have a zombie!");
        });

        it("Should allow different addresses to create zombies", async function () {
            await zombieFactory.connect(addr1).createRandomZombie("Zombie1");
            await zombieFactory.connect(addr2).createRandomZombie("Zombie2");

            expect(await zombieFactory.getTotalZombies()).to.equal(2);
            expect(await zombieFactory.ownerZombieCount(addr1.address)).to.equal(1);
            expect(await zombieFactory.ownerZombieCount(addr2.address)).to.equal(1);
        });
    });

    describe("Zombie Breeding", function () {
        beforeEach(async function () {
            await zombieFactory.connect(addr1).createRandomZombie("Parent1");
            await zombieFactory.connect(addr2).createRandomZombie("Parent2");
        });

        it("Should create zombie from two parents", async function () {
            // Transfer one zombie to addr1 for breeding
            await zombieFactory.connect(addr2).transferFrom(addr2.address, addr1.address, 2);

            const tx = await zombieFactory.connect(addr1).createZombieFromDNA(1, 2, "ChildZombie");
            await expect(tx)
                .to.emit(zombieFactory, "NewZombie")
                .withArgs(3, "ChildZombie", await zombieFactory.zombies(3).then(z => z.dna), await zombieFactory.zombies(3).then(z => z.rarity));

            expect(await zombieFactory.getTotalZombies()).to.equal(3);
            expect(await zombieFactory.ownerZombieCount(addr1.address)).to.equal(2);
        });

        it("Should not allow breeding zombie with itself", async function () {
            await expect(
                zombieFactory.connect(addr1).createZombieFromDNA(1, 1, "ChildZombie")
            ).to.be.revertedWith("Can't breed zombie with itself");
        });

        it("Should not allow breeding zombies from different owners", async function () {
            await expect(
                zombieFactory.connect(addr1).createZombieFromDNA(1, 2, "ChildZombie")
            ).to.be.revertedWith("You don't own the second zombie");
        });
    });

    describe("Zombie Battles", function () {
        beforeEach(async function () {
            await zombieFactory.connect(addr1).createRandomZombie("Fighter1");
            await zombieFactory.connect(addr2).createRandomZombie("Fighter2");

            // Transfer one zombie to addr1 for battle
            await zombieFactory.connect(addr2).transferFrom(addr2.address, addr1.address, 2);
        });

        it("Should allow zombies to battle", async function () {
            const tx = await zombieFactory.connect(addr1).battleZombies(1, 2);

            // Check that one zombie won and one lost
            const zombie1 = await zombieFactory.getZombie(1);
            const zombie2 = await zombieFactory.getZombie(2);

            const totalWins = zombie1.winCount + zombie2.winCount;
            const totalLosses = zombie1.lossCount + zombie2.lossCount;

            expect(totalWins).to.equal(1);
            expect(totalLosses).to.equal(1);
        });

        it("Should not allow battling zombie with itself", async function () {
            await expect(
                zombieFactory.connect(addr1).battleZombies(1, 1)
            ).to.be.revertedWith("Can't battle zombie with itself");
        });

        it("Should not allow battling zombies from different owners", async function () {
            await zombieFactory.connect(addr2).createRandomZombie("Fighter3");

            await expect(
                zombieFactory.connect(addr1).battleZombies(1, 3)
            ).to.be.revertedWith("You don't own the second zombie");
        });
    });

    describe("Zombie Queries", function () {
        beforeEach(async function () {
            await zombieFactory.connect(addr1).createRandomZombie("Zombie1");
            await zombieFactory.connect(addr2).createRandomZombie("Zombie2");
        });

        it("Should return correct zombie details", async function () {
            const zombie = await zombieFactory.getZombie(1);
            expect(zombie.name).to.equal("Zombie1");
            expect(zombie.level).to.equal(1);
        });

        it("Should return zombies by owner", async function () {
            const addr1Zombies = await zombieFactory.getZombiesByOwner(addr1.address);
            const addr2Zombies = await zombieFactory.getZombiesByOwner(addr2.address);

            expect(addr1Zombies.length).to.equal(1);
            expect(addr2Zombies.length).to.equal(1);
            expect(addr1Zombies[0]).to.equal(1);
            expect(addr2Zombies[0]).to.equal(2);
        });

        it("Should return correct total zombie count", async function () {
            expect(await zombieFactory.getTotalZombies()).to.equal(2);
        });
    });

    describe("Rarity System", function () {
        it("Should assign rarity between 1 and 5", async function () {
            await zombieFactory.connect(addr1).createRandomZombie("TestZombie");
            const zombie = await zombieFactory.getZombie(1);
            expect(zombie.rarity).to.be.within(1, 5);
        });
    });

    describe("Cooldown System", function () {
        it("Should set cooldown after zombie creation", async function () {
            await zombieFactory.connect(addr1).createRandomZombie("TestZombie");
            const zombie = await zombieFactory.getZombie(1);

            expect(zombie.readyTime).to.be.greaterThan(Math.floor(Date.now() / 1000));
        });
    });
});
