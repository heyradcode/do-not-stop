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

    const deployCmd = `pnpm hh ignition deploy ignition/modules/CryptoPetsV2Live.ts --network ${network.name} --parameters ${paramsPath}`;

    console.log(`\n🚀 Deploying to ${networkName} (chain ${network.chainId})...`);
    try {
        execSync(deployCmd, { stdio: 'inherit', env: ignitionEnv });
        console.log(`✅ ${networkName} deployed.`);
        await injectContractAddresses(network);
    } catch (error) {
        console.error(
            `❌ Deploy to ${networkName} failed:`,
            error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
    }
}

async function injectContractAddresses(network: NetworkSpec): Promise<void> {
    try {
        const deployedAddressesPath = join(
            process.cwd(),
            'ignition',
            'deployments',
            `chain-${network.chainId}`,
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
        const combatSimAddress  = deployedAddresses['CryptoPetsV2Live#CombatSim']      as string | undefined;

        if (!petCoreAddress) {
            console.error('❌ PetCore proxy not found in deployed_addresses.json');
            return;
        }

        console.log(`📝 PetCore:    ${petCoreAddress}`);
        console.log(`📝 GameLogic:  ${gameLogicAddress  ?? '(not found)'}`);
        console.log(`📝 GameConfig: ${gameConfigAddress ?? '(not found)'}`);
        console.log(`📝 CombatSim:  ${combatSimAddress  ?? '(not found)'}`);

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

        const lines = envContent.split('\n').filter((l) => !l.startsWith('VITE_VRF_COORDINATOR='));

        upsertEnvLine(lines, 'VITE_PETCORE_ADDRESS', petCoreAddress);
        if (gameLogicAddress)  upsertEnvLine(lines, 'VITE_GAMELOGIC_ADDRESS',  gameLogicAddress);
        if (gameConfigAddress) upsertEnvLine(lines, 'VITE_GAMECONFIG_ADDRESS', gameConfigAddress);
        if (combatSimAddress)  upsertEnvLine(lines, 'VITE_COMBATSIM_ADDRESS',  combatSimAddress);

        if (!lines.some((l) => l.startsWith('VITE_API_URL='))) {
            lines.push('VITE_API_URL=http://localhost:3001');
        }

        writeFileSync(frontendEnvLocalPath, lines.filter((l) => l.trim()).join('\n'));
        console.log(`✅ Addresses injected into frontend/.env.local`);
    } catch (error) {
        console.error('❌ Failed to inject addresses:', error instanceof Error ? error.message : 'Unknown error');
    }
}
