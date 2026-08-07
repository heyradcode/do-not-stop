import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData } from "viem";

/** Asserts a call reverted, and that the revert carried `reason`. */
async function rejectsWith(promise: Promise<unknown>, reason: string): Promise<void> {
    await assert.rejects(promise, (error: unknown) => {
        const text = String(error);
        assert.ok(text.includes(reason), `expected a revert containing ${JSON.stringify(reason)}, got:\n${text}`);
        return true;
    });
}

/**
 * ItemCore (roadmap §4).
 *
 * Two things carry the feature's weight and get most of the cases below. Minting and
 * burning are the whole acquisition and consumable path, so who may call them matters more
 * than what they do. Equipping is escrow, and escrow is only worth its cost if the invariants
 * it buys actually hold: one copy of an item cannot buff two pets, and gear follows the pet
 * rather than the wallet that equipped it.
 */
describe("ItemCore", async function () {
    const { viem } = await network.connect();

    const SLOT_WEAPON = 0;
    const SLOT_ARMOR = 1;
    const SLOT_TRINKET = 2;

    const SWORD = 1n;
    const PLATE = 2n;
    const POTION = 3n; // never registered to a slot: a consumable, not equipment

    async function deploy() {
        const [owner, alice, bob, backend] = await viem.getWalletClients();

        const config = await viem.deployContract("GameConfig", [owner.account.address]);

        const petCoreImpl = await viem.deployContract("PetCore");
        const petCoreProxy = await viem.deployContract("ERC1967Proxy", [
            petCoreImpl.address,
            encodeFunctionData({
                abi: petCoreImpl.abi,
                functionName: "initialize",
                args: [config.address, owner.account.address],
            }),
        ]);
        const petCore = await viem.getContractAt("PetCore", petCoreProxy.address);

        const itemCoreImpl = await viem.deployContract("ItemCore");
        const itemCoreProxy = await viem.deployContract("ERC1967Proxy", [
            itemCoreImpl.address,
            encodeFunctionData({
                abi: itemCoreImpl.abi,
                functionName: "initialize",
                args: [petCore.address, owner.account.address],
            }),
        ]);
        const itemCore = await viem.getContractAt("ItemCore", itemCoreProxy.address);

        // Pets 1 and 2 to alice, pet 3 to bob. createPet only writes the entry; mintTo is
        // what gives it an ERC-721 owner, which is the half ItemCore reads.
        for (let i = 0; i < 3; i++) {
            await petCore.write.createPet([`pet${i + 1}`, 1234567890123456n, 3, 0, 0n, 0n]);
        }
        await petCore.write.mintTo([alice.account.address, 1n]);
        await petCore.write.mintTo([alice.account.address, 2n]);
        await petCore.write.mintTo([bob.account.address, 3n]);

        await itemCore.write.authorizeCaller([backend.account.address]);
        await itemCore.write.registerItemSlot([SWORD, SLOT_WEAPON]);
        await itemCore.write.registerItemSlot([PLATE, SLOT_ARMOR]);

        return { itemCore, petCore, owner, alice, bob, backend };
    }

    /** Mints `quantity` of `itemType` to `to` as the authorized backend wallet. */
    async function grant(
        ctx: Awaited<ReturnType<typeof deploy>>,
        to: `0x${string}`,
        itemType: bigint,
        quantity: bigint,
    ) {
        await ctx.itemCore.write.mintTo([to, itemType, quantity], { account: ctx.backend.account });
    }

    describe("initialization", function () {
        it("comes up owned, pointed at PetCore, and serving the default item uri", async function () {
            const ctx = await deploy();
            assert.equal(
                (await ctx.itemCore.read.petCore()).toLowerCase(),
                ctx.petCore.address.toLowerCase(),
            );
            assert.equal(
                (await ctx.itemCore.read.owner()).toLowerCase(),
                ctx.owner.account.address.toLowerCase(),
            );
            assert.equal(await ctx.itemCore.read.uri([1n]), "https://api.cryptopets.io/items/{id}.json");
        });

        it("leaves the implementation itself uninitializable", async function () {
            const impl = await viem.deployContract("ItemCore");
            await rejectsWith(
                impl.write.initialize([impl.address, impl.address]),
                "Initializable: contract is already initialized",
            );
        });
    });

    describe("minting and burning", function () {
        it("credits the recipient's balance", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, POTION, 5n);
            assert.equal(await ctx.itemCore.read.balanceOf([ctx.alice.account.address, POTION]), 5n);
        });

        it("rejects a mint from an unauthorized caller", async function () {
            const ctx = await deploy();
            await rejectsWith(
                ctx.itemCore.write.mintTo([ctx.alice.account.address, POTION, 1n], { account: ctx.alice.account }),
                "Not authorized",
            );
        });

        it("burns from a holder without needing their approval", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, POTION, 3n);
            await ctx.itemCore.write.burnFrom([ctx.alice.account.address, POTION, 2n], {
                account: ctx.backend.account,
            });
            assert.equal(await ctx.itemCore.read.balanceOf([ctx.alice.account.address, POTION]), 1n);
        });

        it("rejects burning more than the holder has, so one potion cannot settle twice", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, POTION, 1n);
            await rejectsWith(
                ctx.itemCore.write.burnFrom([ctx.alice.account.address, POTION, 2n], { account: ctx.backend.account }),
                "burn amount exceeds balance",
            );
        });

        it("rejects a burn from an unauthorized caller", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, POTION, 1n);
            await rejectsWith(
                ctx.itemCore.write.burnFrom([ctx.alice.account.address, POTION, 1n], { account: ctx.bob.account }),
                "Not authorized",
            );
        });

        it("lets the owner revoke a caller it previously authorized", async function () {
            const ctx = await deploy();
            await ctx.itemCore.write.revokeCaller([ctx.backend.account.address]);
            await rejectsWith(
                ctx.itemCore.write.mintTo([ctx.alice.account.address, POTION, 1n], { account: ctx.backend.account }),
                "Not authorized",
            );
        });
    });

    describe("the slot registry", function () {
        it("reports whether an item type is equipment, and where it goes", async function () {
            const ctx = await deploy();
            assert.deepEqual(await ctx.itemCore.read.slotOf([SWORD]), [true, SLOT_WEAPON]);
            assert.deepEqual(await ctx.itemCore.read.slotOf([POTION]), [false, 0]);
        });

        it("refuses item type 0, which is the empty-slot sentinel", async function () {
            const ctx = await deploy();
            await rejectsWith(ctx.itemCore.write.registerItemSlot([0n, SLOT_WEAPON]), "Item type 0 reserved");
        });

        it("refuses a slot the contract does not have", async function () {
            const ctx = await deploy();
            await rejectsWith(ctx.itemCore.write.registerItemSlot([SWORD, 3]), "Unknown slot");
        });

        it("is owner-gated, not authorized-caller-gated", async function () {
            const ctx = await deploy();
            await rejectsWith(
                ctx.itemCore.write.registerItemSlot([POTION, SLOT_TRINKET], { account: ctx.backend.account }),
                "caller is not the owner",
            );
        });
    });

    describe("equipping", function () {
        it("escrows the item into the contract and records the slot", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 1n);

            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });

            assert.equal(await ctx.itemCore.read.balanceOf([ctx.alice.account.address, SWORD]), 0n);
            assert.equal(await ctx.itemCore.read.balanceOf([ctx.itemCore.address, SWORD]), 1n);
            assert.equal(await ctx.itemCore.read.equippedItem([1n, SLOT_WEAPON]), SWORD);
            assert.deepEqual(await ctx.itemCore.read.equipmentOf([1n]), [SWORD, 0n, 0n]);
        });

        it("rejects an item that is not equipment", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, POTION, 1n);
            await rejectsWith(
                ctx.itemCore.write.equip([1n, SLOT_WEAPON, POTION], { account: ctx.alice.account }),
                "Item is not equipment",
            );
        });

        it("rejects equipment put in the wrong slot", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, PLATE, 1n);
            await rejectsWith(
                ctx.itemCore.write.equip([1n, SLOT_WEAPON, PLATE], { account: ctx.alice.account }),
                "Wrong slot for this item",
            );
        });

        it("rejects a second item in an occupied slot", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 2n);
            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });
            await rejectsWith(
                ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account }),
                "Slot already filled",
            );
        });

        it("rejects equipping a pet the caller does not own", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.bob.account.address, SWORD, 1n);
            await rejectsWith(
                ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.bob.account }),
                "Not the owner of this pet",
            );
        });

        it("will not let one copy buff two pets", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 1n);
            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });
            // Alice owns pet 2 as well, and the sword is now escrowed rather than merely
            // flagged, so there is nothing left in her balance to equip onto it.
            await rejectsWith(
                ctx.itemCore.write.equip([2n, SLOT_WEAPON, SWORD], { account: ctx.alice.account }),
                "insufficient balance",
            );
        });
    });

    describe("unequipping", function () {
        it("returns the item to the pet's owner", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 1n);
            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });

            await ctx.itemCore.write.unequip([1n, SLOT_WEAPON], { account: ctx.alice.account });

            assert.equal(await ctx.itemCore.read.balanceOf([ctx.alice.account.address, SWORD]), 1n);
            assert.equal(await ctx.itemCore.read.equippedItem([1n, SLOT_WEAPON]), 0n);
        });

        it("rejects an empty slot", async function () {
            const ctx = await deploy();
            await rejectsWith(
                ctx.itemCore.write.unequip([1n, SLOT_ARMOR], { account: ctx.alice.account }),
                "Slot is empty",
            );
        });

        it("rejects a caller who does not own the pet", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 1n);
            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });
            await rejectsWith(
                ctx.itemCore.write.unequip([1n, SLOT_WEAPON], { account: ctx.bob.account }),
                "Not the owner of this pet",
            );
        });

        it("hands gear to the pet's new owner after a transfer, not to whoever equipped it", async function () {
            const ctx = await deploy();
            await grant(ctx, ctx.alice.account.address, SWORD, 1n);
            await ctx.itemCore.write.equip([1n, SLOT_WEAPON, SWORD], { account: ctx.alice.account });

            await ctx.petCore.write.transferFrom([ctx.alice.account.address, ctx.bob.account.address, 1n], {
                account: ctx.alice.account,
            });

            await rejectsWith(
                ctx.itemCore.write.unequip([1n, SLOT_WEAPON], { account: ctx.alice.account }),
                "Not the owner of this pet",
            );
            await ctx.itemCore.write.unequip([1n, SLOT_WEAPON], { account: ctx.bob.account });

            assert.equal(await ctx.itemCore.read.balanceOf([ctx.bob.account.address, SWORD]), 1n);
            assert.equal(await ctx.itemCore.read.balanceOf([ctx.alice.account.address, SWORD]), 0n);
        });
    });
});
