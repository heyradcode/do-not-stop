#!/usr/bin/env tsx
/**
 * Upgrade GameLogic's UUPS implementation without touching the proxy address.
 *
 * Hardhat Ignition (ignition/modules/CryptoPetsV2Live.ts) only ever handles the first
 * deploy: once a future succeeds, Ignition's journal marks it permanently done, so
 * re-running `deploy:*` reports "nothing new to deploy" regardless of source changes — it
 * doesn't diff bytecode against what's live on-chain. This script deploys a fresh GameLogic
 * implementation directly and calls upgradeToAndCall on the existing GameLogicProxy, which is
 * how a UUPS upgrade actually works: the proxy address (and every consumer's .env config)
 * never changes.
 *
 * Usage:
 *   pnpm --prefix contracts/ethereum exec tsx scripts/upgrade-game-logic.ts --network=base-sepolia
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia } from 'viem/chains';
import { getNetwork, resolveRpcUrl } from './networks.js';

const gameLogicArtifact = JSON.parse(
    readFileSync(join(process.cwd(), 'artifacts', 'src', 'GameLogic.sol', 'GameLogic.json'), 'utf8'),
) as { abi: unknown[]; bytecode: `0x${string}` };

const networkArg = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1];
if (!networkArg) {
    console.error('Usage: tsx scripts/upgrade-game-logic.ts --network=<name>');
    process.exit(1);
}
const network = getNetwork(networkArg);
if (!network) {
    console.error(`Unknown network "${networkArg}". See scripts/networks.ts.`);
    process.exit(1);
}

// Add an entry here if you need to upgrade on a network beyond these two.
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
    console.error('Missing PRIVATE_KEY in contracts/ethereum/.env (must be the GameLogicProxy owner).');
    process.exit(1);
}
const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);

const deployedAddressesPath = join(
    process.cwd(), 'ignition', 'deployments', `chain-${network.chainId}`, 'deployed_addresses.json',
);
const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8')) as Record<string, string>;
const proxyAddress = deployedAddresses['CryptoPetsV2Live#GameLogicProxy'] as `0x${string}` | undefined;
if (!proxyAddress) {
    console.error(`GameLogicProxy not found in ${deployedAddressesPath} — deploy the stack first.`);
    process.exit(1);
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

console.log(`Deploying fresh GameLogic implementation on ${network.name} as ${account.address}...`);
const deployHash = await wallet.deployContract({
    abi: gameLogicArtifact.abi,
    bytecode: gameLogicArtifact.bytecode as `0x${string}`,
    args: [],
});
console.log(`- deploy tx: ${deployHash}`);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const newImpl = deployReceipt.contractAddress;
if (!newImpl) {
    console.error('Deploy succeeded but the receipt has no contractAddress — aborting upgrade.');
    process.exit(1);
}
console.log(`- new GameLogic implementation: ${newImpl}`);

console.log(`Upgrading proxy ${proxyAddress} to point at ${newImpl}...`);
// upgradeTo (not upgradeToAndCall with empty data): no post-upgrade call is needed here —
// initialize() is already run and re-running it would revert (Initializable guard) — and
// this OZ version's upgradeToAndCall always attempts a delegatecall even with empty data,
// which fails with "Address: low-level delegate call failed" since there's nothing to call.
const upgradeHash = await wallet.writeContract({
    address: proxyAddress,
    abi: gameLogicArtifact.abi,
    functionName: 'upgradeTo',
    args: [newImpl],
});
console.log(`- upgrade tx: ${upgradeHash}`);
const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });
console.log(`- upgrade ${upgradeReceipt.status === 'success' ? 'confirmed ✓' : 'REVERTED'}`);

if (upgradeReceipt.status !== 'success') process.exit(1);
console.log(`\nGameLogicProxy (${proxyAddress}) now runs the current source. No .env changes needed anywhere.`);
