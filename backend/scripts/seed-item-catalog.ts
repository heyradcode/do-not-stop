/**
 * Seeds the item catalog (roadmap §4) into `item_definition`, and optionally registers
 * every equipment item's slot on ItemCore.
 *
 * The two halves belong in one command because they are one fact stored twice. The
 * contract is authoritative for slots (only it can reject a wrong-slot equip) and the
 * table is what the UI and the snapshot builder read, so a run that updated one and not
 * the other would leave an equip the app offers and the chain refuses.
 *
 * Usage (from backend/):
 *   pnpm tsx scripts/seed-item-catalog.ts                 # database only
 *   pnpm tsx scripts/seed-item-catalog.ts --with-chain    # database + slot registration
 *   pnpm tsx scripts/seed-item-catalog.ts --dry-run       # print the plan, write nothing
 *
 * Chain registration needs, in backend/.env:
 *   ITEM_CORE_ADDRESS=0x...              the ItemCore proxy (deploy.ts prints it)
 *   ITEM_CORE_RPC_URL=http://...
 *   ITEM_CORE_OWNER_PRIVATE_KEY=0x...    ItemCore's owner
 *
 * Its own key, not the runtime ITEM_CORE_PRIVATE_KEY, because the two roles differ:
 * registerItemSlot is onlyOwner, while the server's wallet only needs authorizeCaller.
 * Sharing one key would hand the always-on service the ability to reshape the catalog.
 *
 * Safe to re-run. Definitions upsert by token id, and registerItemSlot is idempotent for
 * an unchanged slot, so this is the way a catalog edit ships rather than a one-shot.
 */
import 'dotenv/config';

import { prisma } from '../src/config/prisma';
import { assertCatalog, SLOT } from '../src/features/inventory/catalog';
import { ITEM_CATALOG } from '../src/features/inventory/catalog.data';

const ITEM_CORE_ABI = [
    {
        type: 'function',
        name: 'registerItemSlot',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'itemType', type: 'uint256' },
            { name: 'slot', type: 'uint8' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'slotOf',
        stateMutability: 'view',
        inputs: [{ name: 'itemType', type: 'uint256' }],
        outputs: [
            { name: 'isEquipment', type: 'bool' },
            { name: 'slot', type: 'uint8' },
        ],
    },
] as const;

async function seedDatabase(dryRun: boolean): Promise<void> {
    const catalog = assertCatalog(ITEM_CATALOG);
    console.log(`[catalog] ${catalog.length} definitions validated`);

    if (dryRun) {
        for (const item of catalog) {
            console.log(`  would upsert ${item.itemType.padStart(3)} ${item.key} (${item.category})`);
        }
        return;
    }

    try {
        for (const item of catalog) {
            const row = {
                key: item.key,
                category: item.category,
                slot: item.slot === undefined ? null : SLOT[item.slot],
                rarity: item.rarity,
                effect: item.effect ?? null,
                name: item.name,
                description: item.description,
            };
            await prisma.itemDefinition.upsert({
                where: { itemType: item.itemType },
                create: { itemType: item.itemType, ...row },
                update: row,
            });
        }
        console.log(`[catalog] ${catalog.length} definitions written`);

        // Deliberately not deleted. A definition removed from the source file may still be
        // named by an item somebody holds, or by a receipt that has already been signed, and
        // a missing row would leave both unreadable. Retiring an item is a content decision
        // with its own migration, not a side effect of an edit here.
        const orphans = await prisma.itemDefinition.findMany({
            where: { itemType: { notIn: catalog.map((i) => i.itemType) } },
            select: { itemType: true, key: true },
        });
        for (const orphan of orphans) {
            console.warn(`[catalog] ⚠️  ${orphan.itemType} (${orphan.key}) is in the database but not in the source; left in place`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

async function registerSlots(dryRun: boolean): Promise<void> {
    const address = process.env.ITEM_CORE_ADDRESS;
    const rpcUrl = process.env.ITEM_CORE_RPC_URL;
    const privateKey = process.env.ITEM_CORE_OWNER_PRIVATE_KEY;
    if (!address || !rpcUrl || !privateKey) {
        throw new Error(
            '--with-chain needs ITEM_CORE_ADDRESS, ITEM_CORE_RPC_URL and ITEM_CORE_OWNER_PRIVATE_KEY',
        );
    }

    const { createPublicClient, createWalletClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = http(rpcUrl);
    const publicClient = createPublicClient({ transport });
    const walletClient = createWalletClient({ account, transport });
    const chainId = await publicClient.getChainId();

    const equipment = ITEM_CATALOG.filter((item) => item.slot !== undefined);
    console.log(`[chain] ${equipment.length} equipment items, ItemCore ${address} on chain ${chainId}`);

    for (const item of equipment) {
        const want = SLOT[item.slot!];
        const [isEquipment, current] = await publicClient.readContract({
            address: address as `0x${string}`,
            abi: ITEM_CORE_ABI,
            functionName: 'slotOf',
            args: [BigInt(item.itemType)],
        });

        if (isEquipment && current === want) {
            console.log(`  ${item.key} already registered to slot ${want}`);
            continue;
        }
        if (dryRun) {
            console.log(`  would register ${item.key} -> slot ${want}`);
            continue;
        }

        // Sent one at a time and awaited: this runs a handful of times per deployment, so
        // a nonce queue would be machinery for throughput that does not exist.
        const hash = await walletClient.writeContract({
            address: address as `0x${string}`,
            abi: ITEM_CORE_ABI,
            functionName: 'registerItemSlot',
            args: [BigInt(item.itemType), want],
            chain: null,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  registered ${item.key} -> slot ${want} (${hash})`);
    }
}

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    const withChain = process.argv.includes('--with-chain');

    await seedDatabase(dryRun);
    if (withChain) {
        await registerSlots(dryRun);
    } else {
        console.log('[chain] skipped; pass --with-chain to register equipment slots on ItemCore');
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
