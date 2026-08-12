/**
 * Operator tool: compute and record a reward season (§I).
 *
 * `buildSeason` had no caller. There is deliberately no HTTP route — building a season is an
 * operator action with real money attached, and §I keeps it behind an owner key rather than
 * anything reachable with a token — but without a command there was no way to build one at
 * all, so the rewards screen could only ever say "no seasons published".
 *
 * **A season cannot be edited once built.** `buildSeason` refuses to overwrite one, matching
 * `SeasonRewardDistributor.openSeason`'s own refusal: changing entitlements after people have
 * read them is exactly what the contract's immutability prevents. A mistake is corrected by
 * superseding the season with a new one, visibly. So this defaults to a **dry run** and
 * writes nothing until `--commit` is passed.
 *
 * Recording the season is only half the job. The root still has to be opened on chain
 * (`openSeason` on EVM, `open_season` on Solana) and the vault funded, both with the owner
 * key. This prints the values those calls need.
 *
 * Usage (from backend/):
 *   pnpm tsx scripts/build-season.ts \
 *     --season 1 --chain eip155:84532 --deployment base-sepolia-live \
 *     --from 1 --to 1000 \
 *     --distributor 0x... --token 0x... --decimals 18 --evm-chain-id 84532 \
 *     --per-win 100 --per-loss 25 --per-battle-cap 1000
 *
 *   # Solana: --chain-ref replaces --evm-chain-id
 *   pnpm tsx scripts/build-season.ts \
 *     --season 2 --chain solana:devnet --deployment devnet-live \
 *     --from 1 --to 1000 \
 *     --distributor Rewa... --token EPjF... --decimals 6 --chain-ref EtWT... \
 *     --per-win 100 --per-loss 25 --per-battle-cap 1000
 *
 *   # Add --commit to actually write it.
 */
import { chainFamily, type ChainId } from '@cryptopets/protocol';

import { buildSeason, type SeasonInputs } from '@features/battle/rewards';
import { prisma } from '@config/prisma';

function parseArgs(argv: string[]): { inputs: SeasonInputs; commit: boolean } {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const required = (flag: string): string => {
        const value = get(flag);
        if (!value) throw new Error(`missing required ${flag}`);
        return value;
    };

    const chainId = required('--chain');
    const family = chainFamily(chainId as ChainId);
    const distributor = required('--distributor');
    const token = required('--token');

    // Optional, and its absence is loud rather than silent: `buildSeason` warns, because a
    // season with no decimals renders in base units forever.
    const decimalsArg = get('--decimals');
    const decimals = decimalsArg === undefined ? undefined : Number(decimalsArg);
    if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0)) {
        throw new Error(`--decimals must be a non-negative integer, got ${decimalsArg}`);
    }

    // Spread rather than assign: `exactOptionalPropertyTypes` distinguishes "absent" from
    // "present and undefined", and the build-time warning keys on the former. Assigning
    // `decimals: undefined` would set the property and silence the warning while recording
    // nothing.
    const decimalsField = decimals === undefined ? {} : { decimals };
    const target: SeasonInputs['target'] =
        family === 'solana'
            ? { family: 'solana', distributor, token, ...decimalsField, chainRef: required('--chain-ref') }
            : { family: 'evm', distributor, token, ...decimalsField, evmChainId: Number(required('--evm-chain-id')) };

    return {
        commit: argv.includes('--commit'),
        inputs: {
            seasonId: Number(required('--season')),
            chainId,
            deploymentId: required('--deployment'),
            firstSequence: BigInt(required('--from')),
            lastSequence: BigInt(required('--to')),
            target,
            rates: {
                perWin: BigInt(required('--per-win')),
                perLoss: BigInt(required('--per-loss')),
                perBattleCap: BigInt(required('--per-battle-cap')),
            },
        },
    };
}

async function main(): Promise<void> {
    const { inputs, commit } = parseArgs(process.argv.slice(2));

    const existing = await prisma.rewardSeason.findUnique({ where: { seasonId: inputs.seasonId } });
    if (existing) {
        throw new Error(
            `season ${inputs.seasonId} already exists and cannot be edited; supersede it with a new season id`,
        );
    }

    if (!commit) {
        // The dry run stops here on purpose. Everything below this point writes, and a
        // season is the one thing in this system that cannot be taken back.
        const anchored = await prisma.battleReceipt.count({
            where: {
                chainId: inputs.chainId,
                deploymentId: inputs.deploymentId,
                sequence: { gte: inputs.firstSequence, lte: inputs.lastSequence },
                batch: { anchoredAt: { not: null } },
            },
        });
        process.stdout.write(
            `DRY RUN — nothing written.\n` +
                `  season      ${inputs.seasonId} on ${inputs.chainId} (${inputs.deploymentId})\n` +
                `  sequences   ${inputs.firstSequence}..${inputs.lastSequence}\n` +
                `  anchored    ${anchored} receipt(s) in range\n` +
                `  distributor ${inputs.target.distributor}\n` +
                `  token       ${inputs.target.token}` +
                `${inputs.target.decimals === undefined ? '  (no decimals — amounts will render in base units FOREVER)' : ` (${inputs.target.decimals} decimals)`}\n` +
                `  rates       win ${inputs.rates.perWin} / loss ${inputs.rates.perLoss} / cap ${inputs.rates.perBattleCap}\n\n` +
                `Re-run with --commit to build it. A season cannot be edited afterwards.\n`,
        );
        return;
    }

    const season = await buildSeason(inputs);

    process.stdout.write(
        `Built season ${season.seasonId}.\n` +
            `  merkleRoot  ${season.merkleRoot}\n` +
            `  totalAmount ${season.totalAmount}\n` +
            `  wallets     ${season.entitlements.length}\n\n` +
            `Still to do, with the owner key:\n` +
            `  1. Fund the distributor's vault with at least ${season.totalAmount} (smallest unit).\n` +
            `  2. Open the season on chain with this root, a per-wallet cap, a season cap, and a claim window.\n` +
            `     The caps bound what a bad root can cost, so do not set them to the total.\n` +
            `  3. Record the opening transaction against the season so the UI offers the claim.\n`,
    );
}

main()
    .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
