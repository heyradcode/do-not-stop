#!/usr/bin/env tsx
/**
 * Migrate to a new GameConfig (e.g. after adding a tunable like battleFee) without losing
 * any prior on-chain tuning, and without changing GameLogicProxy/PetCoreProxy addresses.
 *
 * GameConfig is NOT behind a proxy (see its own doc comment) — adding a field means
 * deploying a fresh instance, which resets every tunable back to its Solidity constructor
 * default. This script avoids silently discarding live tuning by reading every current
 * value off the OLD GameConfig first and replaying it onto the NEW one via its setters,
 * before pointing GameLogicProxy/PetCoreProxy at it. GameLogic and PetCore also need a
 * setGameConfig() setter to repoint at the new instance, so this upgrades both proxies'
 * implementations first (same upgradeTo pattern as upgrade-game-logic.ts).
 *
 * battleCooldown has no setter (see GameConfig.sol) — it's fixed at construction from
 * source, so the new instance already carries whatever the current source defines; there
 * is nothing to replay for it.
 *
 * Usage:
 *   pnpm --prefix contracts/ethereum exec tsx scripts/upgrade-game-config.ts --network=base-sepolia
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia } from 'viem/chains';
import { getNetwork, resolveRpcUrl } from './networks.js';

function loadArtifact(name: string): { abi: unknown[]; bytecode: `0x${string}` } {
    return JSON.parse(
        readFileSync(join(process.cwd(), 'artifacts', 'src', `${name}.sol`, `${name}.json`), 'utf8'),
    ) as { abi: unknown[]; bytecode: `0x${string}` };
}
const gameConfigArtifact = loadArtifact('GameConfig');
const gameLogicArtifact = loadArtifact('GameLogic');
const petCoreArtifact = loadArtifact('PetCore');

const networkArg = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1];
if (!networkArg) {
    console.error('Usage: tsx scripts/upgrade-game-config.ts --network=<name>');
    process.exit(1);
}
const network = getNetwork(networkArg);
if (!network) {
    console.error(`Unknown network "${networkArg}". See scripts/networks.ts.`);
    process.exit(1);
}

const CHAINS: Record<string, Chain> = { sepolia, 'base-sepolia': baseSepolia };
const chain = CHAINS[network.name];
if (!chain) {
    console.error(`No viem chain wired up for "${network.name}" in this script — add it to CHAINS.`);
    process.exit(1);
}

const rpcUrl = resolveRpcUrl(network);
if (!rpcUrl) {
    console.error(`Missing ${network.envPrefix}_RPC_URL in contracts/ethereum/.env`);
    process.exit(1);
}

const pk = process.env.PRIVATE_KEY;
if (!pk) {
    console.error('Missing PRIVATE_KEY in contracts/ethereum/.env (must be the owner of all three contracts).');
    process.exit(1);
}
const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);

const deployedAddressesPath = join(
    process.cwd(), 'ignition', 'deployments', `chain-${network.chainId}`, 'deployed_addresses.json',
);
const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8')) as Record<string, string>;
const oldConfigAddress  = deployedAddresses['CryptoPetsV2Live#GameConfig'] as `0x${string}` | undefined;
const gameLogicProxy    = deployedAddresses['CryptoPetsV2Live#GameLogicProxy'] as `0x${string}` | undefined;
const petCoreProxy      = deployedAddresses['CryptoPetsV2Live#PetCoreProxy'] as `0x${string}` | undefined;
if (!oldConfigAddress || !gameLogicProxy || !petCoreProxy) {
    console.error(`Missing GameConfig/GameLogicProxy/PetCoreProxy in ${deployedAddressesPath} — deploy the stack first.`);
    process.exit(1);
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

async function deploy(artifact: { abi: unknown[]; bytecode: `0x${string}` }, args: unknown[] = []) {
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error(`Deploy succeeded but receipt has no contractAddress (tx ${hash})`);
    return receipt.contractAddress;
}

async function write(address: `0x${string}`, abi: unknown[], functionName: string, args: unknown[]) {
    const hash = await wallet.writeContract({ address, abi, functionName, args } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName}(${args.join(', ')}) reverted (tx ${hash})`);
    console.log(`  - ${functionName}(${args.join(', ')}) ✓`);
}

async function read<T>(address: `0x${string}`, abi: unknown[], functionName: string, args: unknown[] = []): Promise<T> {
    return publicClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;
}

async function main() {
    console.log(`Deploying fresh GameConfig on ${network!.name} as ${account.address}...`);
    const newConfigAddress = await deploy(gameConfigArtifact, [account.address]);
    console.log(`- new GameConfig: ${newConfigAddress}`);

    console.log(`\nReplaying tunables from old GameConfig (${oldConfigAddress}) onto the new one...`);
    const oldAbi = gameConfigArtifact.abi;
    const combatSim = await read<`0x${string}`>(oldConfigAddress!, oldAbi, 'combatSim');
    await write(newConfigAddress, oldAbi, 'setCombatSim', [combatSim]);

    const singleFieldSetters: [string, string][] = [
        ['levelUpFee', 'setLevelUpFee'],
        ['breedFee', 'setBreedFee'],
        ['baseMintFee', 'setBaseMintFee'],
        ['breedCooldownBase', 'setBreedCooldownBase'],
        ['newbornCooldown', 'setNewbornCooldown'],
        ['generationCap', 'setGenerationCap'],
        ['trainFee', 'setTrainFee'],
        ['trainCooldown', 'setTrainCooldown'],
        ['trainXp', 'setTrainXp'],
        ['maxLevel', 'setMaxLevel'],
        ['levelBandWidth', 'setLevelBandWidth'],
        ['studFee', 'setStudFee'],
        ['marriageCooldown', 'setMarriageCooldown'],
        ['proposalTTL', 'setProposalTTL'],
        ['tankHpMult', 'setTankHpMult'],
        ['shellDefMult', 'setShellDefMult'],
        ['swiftCritBonus', 'setSwiftCritBonus'],
        ['cunningCritCap', 'setCunningCritCap'],
        ['furyDmgMult', 'setFuryDmgMult'],
        ['furyHpThreshold', 'setFuryHpThreshold'],
        ['sageMdefMult', 'setSageMdefMult'],
        ['bloodlustBps', 'setBloodlustBps'],
    ];
    for (const [getter, setter] of singleFieldSetters) {
        const value = await read<bigint | number>(oldConfigAddress!, oldAbi, getter);
        await write(newConfigAddress, oldAbi, setter, [value]);
    }

    for (let tier = 1; tier <= 5; tier++) {
        const size = await read<number>(oldConfigAddress!, oldAbi, 'poolSizes', [tier]);
        await write(newConfigAddress, oldAbi, 'setPoolSize', [tier, size]);
    }

    // battleFee has no old value to replay — the new GameConfig's own constructor default
    // applies (see GameConfig.sol; tune via setBattleFee afterward if the default is wrong).

    console.log(`\nDeploying fresh GameLogic + PetCore implementations (both need setGameConfig)...`);
    const newGameLogicImpl = await deploy(gameLogicArtifact);
    console.log(`- new GameLogic implementation: ${newGameLogicImpl}`);
    const newPetCoreImpl = await deploy(petCoreArtifact);
    console.log(`- new PetCore implementation: ${newPetCoreImpl}`);

    console.log(`\nUpgrading proxies...`);
    await write(gameLogicProxy!, gameLogicArtifact.abi, 'upgradeTo', [newGameLogicImpl]);
    await write(petCoreProxy!, petCoreArtifact.abi, 'upgradeTo', [newPetCoreImpl]);

    console.log(`\nRepointing both proxies at the new GameConfig...`);
    await write(gameLogicProxy!, gameLogicArtifact.abi, 'setGameConfig', [newConfigAddress]);
    await write(petCoreProxy!, petCoreArtifact.abi, 'setGameConfig', [newConfigAddress]);

    console.log(
        `\nDone. GameLogicProxy (${gameLogicProxy}) and PetCoreProxy (${petCoreProxy}) both now ` +
        `point at GameConfig ${newConfigAddress}. Update ignition/deployments/chain-${network!.chainId}` +
        `/deployed_addresses.json's "CryptoPetsV2Live#GameConfig" entry to match (informational only — ` +
        `nothing reads it at runtime, but scripts here do).`,
    );
}

await main();
