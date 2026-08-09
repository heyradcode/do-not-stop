#!/usr/bin/env tsx

import 'dotenv/config';

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getNetwork, resolveRpcUrl, resolveEntropyParams, NetworkSpec } from './networks.js';

function getActiveNetworkNames(): string[] {
    const flag = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1];
    if (flag) return [flag];
    if (process.env.DEPLOY_NETWORK) return [process.env.DEPLOY_NETWORK];

    const configPath = join(process.cwd(), 'active-networks.json');
    if (!existsSync(configPath)) {
        console.error(
            '❌ No network specified. Pass --network=<name>, set DEPLOY_NETWORK, ' +
            'or list target networks in active-networks.json.'
        );
        process.exit(1);
    }
    const names = JSON.parse(readFileSync(configPath, 'utf8')) as string[];
    if (!names.length) {
        console.error('❌ active-networks.json is empty — add at least one network name.');
        process.exit(1);
    }
    return names;
}

const networkNames = getActiveNetworkNames();

const localNetwork = networkNames.find((n) => n === 'localhost' || n === 'hardhat');
if (localNetwork) {
    console.error(`❌ "${localNetwork}" cannot be deployed via this script. Run \`pnpm test\` instead.`);
    process.exit(1);
}

if (!process.env.PRIVATE_KEY) {
    console.error('❌ Missing PRIVATE_KEY in contracts/ethereum/.env');
    process.exit(1);
}

const ignitionEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Bypass Hardhat Ignition's interactive confirmation prompts (auto-cancel in non-TTY).
    HARDHAT_IGNITION_CONFIRM_DEPLOYMENT: '1',
    HARDHAT_IGNITION_CONFIRM_RESET: '1',
};

for (const networkName of networkNames) {
    await deployToNetwork(networkName);
}

async function deployToNetwork(networkName: string): Promise<void> {
    const network = getNetwork(networkName);
    if (!network) {
        console.error(`❌ Unknown network "${networkName}". See scripts/networks.ts.`);
        process.exit(1);
    }

    if (!resolveRpcUrl(network)) {
        console.error(`❌ Missing ${network.envPrefix}_RPC_URL in contracts/ethereum/.env`);
        process.exit(1);
    }

    let entropy;
    try {
        entropy = resolveEntropyParams(network);
    } catch (e) {
        console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }

    const paramsDir = join(process.cwd(), 'ignition', 'parameters');
    mkdirSync(paramsDir, { recursive: true });
    const paramsPath = join(paramsDir, `.runtime-${network.name}.json`);
    writeFileSync(
        paramsPath,
        JSON.stringify({ CryptoPetsV2Live: { entropyAddress: entropy.entropyAddress } }, null, 2)
    );

    // Ignition keys deployment state by id, defaulting to `chain-<id>`. Re-running against
    // an existing one RECONCILES with it: futures already deployed are kept, so the old
    // proxies survive. That is wrong for the 2.0.0 contracts, whose storage layout is
    // deliberately breaking (see GameLogic/PetCore) — reusing a proxy from before would
    // leave it pointing at an implementation that reads its slots differently.
    //
    // So warn loudly and let the operator pass an explicit id, rather than guessing which
    // they meant.
    const deploymentId = process.argv.find((a) => a.startsWith('--deployment-id='))?.split('=')[1];
    const existingDeployment = join(process.cwd(), 'ignition', 'deployments', `chain-${network.chainId}`);
    if (!deploymentId && existsSync(existingDeployment)) {
        console.warn(
            `\n⚠️  A deployment already exists for chain ${network.chainId}.\n` +
            `   Ignition reconciles against it and keeps the existing proxies.\n` +
            `   The 2.0.0 contracts change storage layout and are NOT upgrade-compatible,\n` +
            `   so an existing proxy must not be reused.\n\n` +
            `   For a fresh stack: pnpm deploy:${network.name} --deployment-id=<name>\n`
        );
    }

    const deployCmd = [
        'pnpm hh ignition deploy ignition/modules/CryptoPetsV2Live.ts',
        `--network ${network.name}`,
        `--parameters ${paramsPath}`,
        ...(deploymentId ? [`--deployment-id ${deploymentId}`] : []),
    ].join(' ');

    console.log(`\n🚀 Deploying to ${networkName} (chain ${network.chainId})...`);
    try {
        execSync(deployCmd, { stdio: 'inherit', env: ignitionEnv });
        console.log(`✅ ${networkName} deployed.`);
        await injectContractAddresses(network, deploymentId);
    } catch (error) {
        console.error(
            `❌ Deploy to ${networkName} failed:`,
            error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
    }
}

async function injectContractAddresses(network: NetworkSpec, deploymentId?: string): Promise<void> {
    try {
        // Must read back the deployment we just wrote, not `chain-<id>`. With an explicit
        // --deployment-id those are different directories, and the default one holds the
        // stack this deploy exists to replace — injecting from it would point the frontend
        // at the dead pre-2.0.0 proxies while reporting success.
        const deployedAddressesPath = join(
            process.cwd(),
            'ignition',
            'deployments',
            deploymentId ?? `chain-${network.chainId}`,
            'deployed_addresses.json'
        );

        if (!existsSync(deployedAddressesPath)) {
            console.error('❌ deployed_addresses.json not found — skipping injection');
            return;
        }

        const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8'));

        const petCoreAddress    = deployedAddresses['CryptoPetsV2Live#PetCoreProxy']   as string | undefined;
        const gameLogicAddress  = deployedAddresses['CryptoPetsV2Live#GameLogicProxy'] as string | undefined;
        const gameConfigAddress = deployedAddresses['CryptoPetsV2Live#GameConfig']     as string | undefined;
        const itemCoreAddress   = deployedAddresses['CryptoPetsV2Live#ItemCoreProxy']  as string | undefined;
        const batchRegistryAddress = deployedAddresses['CryptoPetsV2Live#BattleBatchRegistry']    as string | undefined;
        const rewardDistributorAddress = deployedAddresses['CryptoPetsV2Live#SeasonRewardDistributor'] as string | undefined;

        if (!petCoreAddress) {
            console.error('❌ PetCore proxy not found in deployed_addresses.json');
            return;
        }

        console.log(`📝 PetCore:    ${petCoreAddress}`);
        console.log(`📝 GameLogic:  ${gameLogicAddress  ?? '(not found)'}`);
        console.log(`📝 GameConfig: ${gameConfigAddress ?? '(not found)'}`);
        console.log(`📝 ItemCore:   ${itemCoreAddress   ?? '(not found)'}`);
        console.log(`📝 BattleBatchRegistry:     ${batchRegistryAddress      ?? '(not found)'}`);
        console.log(`📝 SeasonRewardDistributor: ${rewardDistributorAddress  ?? '(not found)'}`);

        // These are read by the backend, not the frontend, so they are printed for the
        // operator to copy rather than written into frontend/.env.local.
        if (batchRegistryAddress) {
            console.log(`
   backend/.env: BATTLE_ANCHOR_REGISTRY_ADDRESS=${batchRegistryAddress}`);
        }
        // ItemCore goes to both: the backend mints and burns through it, and the frontend
        // sends equip/unequip itself, so its address is injected below as well.
        if (itemCoreAddress) {
            console.log(`   backend/.env: ITEM_CORE_ADDRESS=${itemCoreAddress}`);
        }

        const frontendEnvLocalPath = join(process.cwd(), '..', '..', 'frontend', '.env.local');

        let envContent = '';
        if (existsSync(frontendEnvLocalPath)) {
            envContent = readFileSync(frontendEnvLocalPath, 'utf8');
        }

        function upsertEnvLine(lines: string[], key: string, value: string): void {
            const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
            if (idx >= 0) { lines[idx] = `${key}=${value}`; }
            else           { lines.push(`${key}=${value}`); }
        }

        // Drop vars for contracts this stack no longer deploys, so an existing .env.local
        // does not keep pointing the frontend at a dead address: VITE_VRF_COORDINATOR from
        // the Chainlink era, VITE_COMBATSIM_ADDRESS since battles left the chain (§L Phase 6).
        const STALE_ENV_KEYS = ['VITE_VRF_COORDINATOR=', 'VITE_COMBATSIM_ADDRESS='];
        const lines = envContent.split('\n').filter((l) => !STALE_ENV_KEYS.some((k) => l.startsWith(k)));

        upsertEnvLine(lines, 'VITE_PETCORE_ADDRESS', petCoreAddress);
        if (gameLogicAddress)  upsertEnvLine(lines, 'VITE_GAMELOGIC_ADDRESS',  gameLogicAddress);
        if (gameConfigAddress) upsertEnvLine(lines, 'VITE_GAMECONFIG_ADDRESS', gameConfigAddress);
        if (itemCoreAddress)   upsertEnvLine(lines, 'VITE_ITEMCORE_ADDRESS',   itemCoreAddress);

        if (!lines.some((l) => l.startsWith('VITE_API_URL='))) {
            lines.push('VITE_API_URL=http://localhost:3001');
        }

        writeFileSync(frontendEnvLocalPath, lines.filter((l) => l.trim()).join('\n'));
        console.log(`✅ Addresses injected into frontend/.env.local`);
    } catch (error) {
        console.error('❌ Failed to inject addresses:', error instanceof Error ? error.message : 'Unknown error');
    }
}
