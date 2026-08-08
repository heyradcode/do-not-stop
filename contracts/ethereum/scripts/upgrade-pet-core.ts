#!/usr/bin/env tsx
/**
 * Upgrade PetCore's UUPS implementation without touching the proxy address, and
 * optionally point tokenURI at the metadata service in the same run.
 *
 * Same reasoning as upgrade-game-logic.ts: Hardhat Ignition only handles the first
 * deploy, so `deploy:*` reports "nothing new to deploy" no matter how the source changed.
 * This deploys a fresh PetCore implementation and calls upgradeTo on the existing
 * PetCoreProxy, so the proxy address (and every consumer's .env) never changes.
 *
 * The base URI is a separate owner call, not part of the upgrade: an upgrade alone leaves
 * tokenURI returning exactly what it returned before (DEFAULT_BASE_TOKEN_URI), so the two
 * steps can be verified independently and the URI can be changed later without redeploying.
 *
 * Usage:
 *   pnpm --prefix contracts/ethereum exec tsx scripts/upgrade-pet-core.ts --network=base-sepolia
 *   pnpm --prefix contracts/ethereum exec tsx scripts/upgrade-pet-core.ts --network=base-sepolia \
 *       --base-uri=https://art.cryptopets.io/metadata/evm/
 *
 * The token id is appended verbatim, so --base-uri must end with its own separator
 * (usually "/"). Pass --base-uri only, with no upgrade, via --skip-upgrade.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia } from 'viem/chains';
import { getNetwork, resolveDeploymentDir, resolveRpcUrl } from './networks.js';

const petCoreArtifact = JSON.parse(
    readFileSync(join(process.cwd(), 'artifacts', 'src', 'PetCore.sol', 'PetCore.json'), 'utf8'),
) as { abi: unknown[]; bytecode: `0x${string}` };

const arg = (name: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const networkArg = arg('network');
if (!networkArg) {
    console.error('Usage: tsx scripts/upgrade-pet-core.ts --network=<name> [--base-uri=<url>] [--skip-upgrade]');
    process.exit(1);
}
const network = getNetwork(networkArg);
if (!network) {
    console.error(`Unknown network "${networkArg}". See scripts/networks.ts.`);
    process.exit(1);
}

const baseUri = arg('base-uri');
const skipUpgrade = process.argv.includes('--skip-upgrade');
if (skipUpgrade && baseUri === undefined) {
    console.error('--skip-upgrade with no --base-uri would do nothing.');
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
    console.error('Missing PRIVATE_KEY in contracts/ethereum/.env (must be the PetCoreProxy owner).');
    process.exit(1);
}
const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);

const deploymentDir = resolveDeploymentDir(network);
const deployedAddressesPath = join(
    process.cwd(), 'ignition', 'deployments', deploymentDir, 'deployed_addresses.json',
);
const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8')) as Record<string, string>;
const proxyAddress = deployedAddresses['CryptoPetsV2Live#PetCoreProxy'] as `0x${string}` | undefined;
if (!proxyAddress) {
    console.error(`PetCoreProxy not found in ${deployedAddressesPath} — deploy the stack first.`);
    process.exit(1);
}
// Said out loud before anything is sent. Upgrading the wrong proxy is silent: it succeeds,
// and the stack everyone is using is simply not the one that changed.
console.log(`Deployment "${deploymentDir}" -> PetCoreProxy ${proxyAddress}`);

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

if (!skipUpgrade) {
    console.log(`Deploying fresh PetCore implementation on ${network.name} as ${account.address}...`);
    const deployHash = await wallet.deployContract({
        abi: petCoreArtifact.abi,
        bytecode: petCoreArtifact.bytecode as `0x${string}`,
        args: [],
    });
    console.log(`- deploy tx: ${deployHash}`);
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const newImpl = deployReceipt.contractAddress;
    if (!newImpl) {
        console.error('Deploy succeeded but the receipt has no contractAddress — aborting upgrade.');
        process.exit(1);
    }
    console.log(`- new PetCore implementation: ${newImpl}`);

    console.log(`Upgrading proxy ${proxyAddress} to point at ${newImpl}...`);
    // upgradeTo, not upgradeToAndCall: initialize() has already run and re-running it
    // would revert, and this OZ version's upgradeToAndCall delegatecalls even with empty
    // data, failing with "Address: low-level delegate call failed".
    const upgradeHash = await wallet.writeContract({
        address: proxyAddress,
        abi: petCoreArtifact.abi,
        functionName: 'upgradeTo',
        args: [newImpl],
    });
    console.log(`- upgrade tx: ${upgradeHash}`);
    const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });
    console.log(`- upgrade ${upgradeReceipt.status === 'success' ? 'confirmed ✓' : 'REVERTED'}`);
    if (upgradeReceipt.status !== 'success') process.exit(1);

    const version = await publicClient.readContract({
        address: proxyAddress,
        abi: petCoreArtifact.abi,
        functionName: 'VERSION',
    });
    console.log(`- proxy now reports VERSION ${String(version)}`);
}

if (baseUri !== undefined) {
    if (baseUri !== '' && !/[/=?&#]$/.test(baseUri)) {
        // Warn rather than refuse: a query-style base is legitimate, and the value is
        // fixable by re-running. Appending "7" to ".../metadata" is the mistake to catch.
        console.warn(`! --base-uri does not end with a separator: "${baseUri}"`);
        console.warn(`  tokenURI(7) would be "${baseUri}7" — pass a trailing "/" if that is wrong.`);
    }

    console.log(`Setting base token URI to "${baseUri || '(empty -> contract default)'}"...`);
    const setHash = await wallet.writeContract({
        address: proxyAddress,
        abi: petCoreArtifact.abi,
        functionName: 'setBaseTokenUri',
        args: [baseUri],
    });
    console.log(`- set tx: ${setHash}`);
    const setReceipt = await publicClient.waitForTransactionReceipt({ hash: setHash });
    console.log(`- set ${setReceipt.status === 'success' ? 'confirmed ✓' : 'REVERTED'}`);
    if (setReceipt.status !== 'success') process.exit(1);
}

const effective = await publicClient.readContract({
    address: proxyAddress,
    abi: petCoreArtifact.abi,
    functionName: 'baseTokenUri',
});
console.log(`\nPetCoreProxy (${proxyAddress}) base token URI: ${String(effective)}`);
console.log('No .env changes needed anywhere — the proxy address is unchanged.');
