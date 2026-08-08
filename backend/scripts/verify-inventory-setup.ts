/**
 * Read-only preflight for the inventory feature (roadmap §4).
 *
 * Run after `prisma migrate deploy` and the catalog seeder to confirm the parts that only
 * exist at deploy time actually line up. Everything the test suites can check is already
 * checked; what they cannot see is whether *this* database has the tables, whether RLS is
 * on, whether the catalog was seeded, and whether ItemCore agrees with it.
 *
 * Usage (from backend/):
 *   pnpm tsx scripts/verify-inventory-setup.ts
 *
 * Writes nothing, ever. Safe against production, which is the point: the two steps it
 * checks are operator actions against the one database this repo has, and an operator
 * should be able to confirm them without a second write.
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */
import 'dotenv/config';

import { prisma } from '../src/config/prisma';
import { assertCatalog, SLOT } from '../src/features/inventory/catalog';
import { ITEM_CATALOG } from '../src/features/inventory/catalog.data';

const ITEM_CORE_ABI = [
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
    {
        type: 'function',
        name: 'authorizedCallers',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        type: 'function',
        name: 'owner',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }],
    },
] as const;

/** The four tables §4 adds. Named here so a rename has to be made deliberately. */
const TABLES = ['item_definition', 'item_roster', 'pet_equipment', 'item_entitlement'] as const;

interface Check {
    name: string;
    ok: boolean;
    detail: string;
}

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

async function checkDatabase(): Promise<void> {
    // Existence and RLS in one query. RLS with no policies is the posture every other table
    // in this database has: it denies the PostgREST roles everything while the backend
    // connects as the owner and bypasses it. A table missing it is readable *and*
    // deletable by anyone holding the project's public anon key.
    const rows = await prisma.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = ANY(${[...TABLES]}::text[])
    `;
    const found = new Map(rows.map((r) => [r.tablename, r.rowsecurity]));

    for (const table of TABLES) {
        if (!found.has(table)) {
            record(`table ${table}`, false, 'missing — has prisma migrate deploy run?');
            continue;
        }
        record(`table ${table}`, true, 'present');
        record(
            `RLS on ${table}`,
            found.get(table) === true,
            found.get(table) === true
                ? 'enabled'
                : 'DISABLED — anyone with the anon key can read and delete this table',
        );
    }
}

async function checkCatalog(): Promise<void> {
    const expected = assertCatalog(ITEM_CATALOG);
    const stored = await prisma.itemDefinition.findMany({
        select: { itemType: true, key: true, slot: true, rarity: true },
    });
    const byType = new Map(stored.map((row) => [row.itemType, row]));

    if (stored.length === 0) {
        record('catalog seeded', false, 'item_definition is empty — run scripts/seed-item-catalog.ts');
        return;
    }

    const missing = expected.filter((item) => !byType.has(item.itemType));
    record(
        'catalog seeded',
        missing.length === 0,
        missing.length === 0
            ? `${stored.length} definitions, all ${expected.length} shipped items present`
            : `missing ${missing.length}: ${missing.map((i) => i.key).join(', ')}`,
    );

    // A drifted slot is the one mismatch that produces an equip the UI offers and the chain
    // refuses, so it is worth naming separately from "seeded".
    const drifted = expected.filter((item) => {
        const row = byType.get(item.itemType);
        return row && row.slot !== (item.slot === undefined ? null : SLOT[item.slot]);
    });
    record(
        'catalog slots match the source',
        drifted.length === 0,
        drifted.length === 0 ? 'no drift' : `drifted: ${drifted.map((i) => i.key).join(', ')}`,
    );
}

async function checkChain(): Promise<void> {
    const address = process.env.ITEM_CORE_ADDRESS;
    const rpcUrl = process.env.ITEM_CORE_RPC_URL;
    if (!address || !rpcUrl) {
        record('ItemCore reachable', false, 'ITEM_CORE_ADDRESS / ITEM_CORE_RPC_URL not set — chain checks skipped');
        return;
    }

    const { createPublicClient, http } = await import('viem');
    const client = createPublicClient({ transport: http(rpcUrl) });

    let chainId: number;
    try {
        chainId = await client.getChainId();
    } catch (error) {
        record('ItemCore reachable', false, `RPC unreachable: ${(error as Error).message}`);
        return;
    }
    record('ItemCore reachable', true, `chain ${chainId} at ${address}`);

    // The runtime wallet must be an authorized caller, or every claim and every consumable
    // burn reverts. Checked rather than assumed, because the failure only shows up the
    // first time a player spends something.
    const privateKey = process.env.ITEM_CORE_PRIVATE_KEY;
    if (privateKey) {
        const { privateKeyToAccount } = await import('viem/accounts');
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        const [authorized, owner] = await Promise.all([
            client.readContract({
                address: address as `0x${string}`,
                abi: ITEM_CORE_ABI,
                functionName: 'authorizedCallers',
                args: [account.address],
            }),
            client.readContract({ address: address as `0x${string}`, abi: ITEM_CORE_ABI, functionName: 'owner' }),
        ]);
        const isOwner = owner.toLowerCase() === account.address.toLowerCase();
        record(
            'item wallet may mint and burn',
            authorized || isOwner,
            authorized ? 'authorized caller' : isOwner ? 'is the owner' : `${account.address} is neither owner nor an authorized caller`,
        );
    }

    // Every equipment item has to be registered on chain, or equip reverts with
    // "Item is not equipment" for something the catalog calls equipment.
    const equipment = ITEM_CATALOG.filter((item) => item.slot !== undefined);
    const mismatched: string[] = [];
    for (const item of equipment) {
        const [isEquipment, slot] = await client.readContract({
            address: address as `0x${string}`,
            abi: ITEM_CORE_ABI,
            functionName: 'slotOf',
            args: [BigInt(item.itemType)],
        });
        if (!isEquipment || slot !== SLOT[item.slot!]) {
            mismatched.push(`${item.key} (chain: ${isEquipment ? `slot ${slot}` : 'unregistered'})`);
        }
    }
    record(
        'equipment slots registered on chain',
        mismatched.length === 0,
        mismatched.length === 0
            ? `${equipment.length} items registered`
            : `${mismatched.length} wrong: ${mismatched.join(', ')} — run seed-item-catalog.ts --with-chain`,
    );
}

async function main(): Promise<void> {
    try {
        await checkDatabase();
        await checkCatalog();
    } catch (error) {
        record('database', false, `could not query: ${(error as Error).message}`);
    } finally {
        await prisma.$disconnect();
    }

    await checkChain();

    const width = Math.max(...checks.map((c) => c.name.length));
    for (const check of checks) {
        console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.name.padEnd(width)}  ${check.detail}`);
    }

    const failed = checks.filter((c) => !c.ok);
    console.log(failed.length === 0 ? '\nInventory is wired up.' : `\n${failed.length} check(s) failed.`);
    process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
