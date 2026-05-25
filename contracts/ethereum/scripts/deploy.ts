#!/usr/bin/env tsx

import 'dotenv/config';

import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';

import { getNetwork, resolveRpcUrl, resolveVrfParams } from './networks.js';

const NETWORK_NAME =
    process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] ??
    process.env.DEPLOY_NETWORK ??
    'localhost';

const IS_LOCAL = NETWORK_NAME === 'localhost' || NETWORK_NAME === 'hardhat';

const localDeployerAbi = [
    {
        type: 'function',
        name: 'cryptoPets',
        inputs: [],
        outputs: [{ type: 'address', name: '' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'vrfCoordinator',
        inputs: [],
        outputs: [{ type: 'address', name: '' }],
        stateMutability: 'view',
    },
] as const;

const ignitionEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Bypass Hardhat Ignition's interactive "Confirm deploy to network X?" prompt.
    // Without this, prompts auto-cancel in a non-TTY parent and the deploy silently exits.
    HARDHAT_IGNITION_CONFIRM_DEPLOYMENT: '1',
    HARDHAT_IGNITION_CONFIRM_RESET: '1',
};

let chainDir: string;
let deployCmd: string;

if (IS_LOCAL) {
    chainDir = 'chain-31337';
    deployCmd = `pnpm hh ignition deploy ignition/modules/CryptoPets.ts --network localhost`;
    console.log('⏳ Waiting for Hardhat node to be ready...');
    await setTimeout(10000);
} else {
    const network = getNetwork(NETWORK_NAME);
    if (!network) {
        console.error(
            `❌ Unknown network "${NETWORK_NAME}". See scripts/networks.ts for supported networks.`
        );
        process.exit(1);
    }

    if (!resolveRpcUrl(network)) {
        console.error(
            `❌ Missing ${network.envPrefix}_RPC_URL in contracts/ethereum/.env`
        );
        process.exit(1);
    }
    if (!process.env.PRIVATE_KEY) {
        console.error('❌ Missing PRIVATE_KEY in contracts/ethereum/.env');
        process.exit(1);
    }

    let vrf;
    try {
        vrf = resolveVrfParams(network);
    } catch (e) {
        console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }

    // Write the runtime parameters file. Gitignored so secrets/subscription
    // IDs aren't committed; it's regenerated on every deploy.
    const paramsDir = join(process.cwd(), 'ignition', 'parameters');
    mkdirSync(paramsDir, { recursive: true });
    const paramsPath = join(paramsDir, `.runtime-${network.name}.json`);
    writeFileSync(
        paramsPath,
        JSON.stringify(
            {
                CryptoPetsLive: {
                    vrfSubscriptionId: vrf.vrfSubscriptionId,
                    vrfKeyHash: vrf.vrfKeyHash,
                    vrfCoordinator: vrf.vrfCoordinator,
                    vrfNativePayment: vrf.vrfNativePayment,
                },
            },
            null,
            2
        )
    );

    chainDir = `chain-${network.chainId}`;
    deployCmd = `pnpm hh ignition deploy ignition/modules/CryptoPetsLive.ts --network ${network.name} --parameters ${paramsPath}`;
}

console.log(`🚀 Deploying contracts to ${NETWORK_NAME} network...`);
try {
    execSync(deployCmd, { stdio: 'inherit', env: ignitionEnv });
    console.log('✅ Contracts deployed successfully!');

    await injectContractAddress();
} catch (error) {
    console.error(
        '❌ Contract deployment failed:',
        error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
}

async function injectContractAddress(): Promise<void> {
    try {
        const deployedAddressesPath = join(
            process.cwd(),
            'ignition',
            'deployments',
            chainDir,
            'deployed_addresses.json'
        );

        if (!existsSync(deployedAddressesPath)) {
            console.error('❌ Deployed addresses file not found');
            return;
        }

        const deployedAddresses = JSON.parse(
            readFileSync(deployedAddressesPath, 'utf8')
        );

        let contractAddress: `0x${string}` | undefined;

        const localDeployerAddr = (deployedAddresses['CryptoPetsModule#localDeployer'] ??
            deployedAddresses['CryptoPetsModule#LocalCryptoPetsDeployer']) as
            | `0x${string}`
            | undefined;
        // Live deployments: new generic module is CryptoPetsLive#cryptoPets.
        // Legacy CryptoPetsSepolia#CryptoPets is kept for back-compat with
        // pre-refactor deployments still on disk.
        const liveAddr = (deployedAddresses['CryptoPetsLive#cryptoPets'] ??
            deployedAddresses['CryptoPetsSepolia#cryptoPets'] ??
            deployedAddresses['CryptoPetsSepolia#CryptoPets']) as string | undefined;

        if (IS_LOCAL && localDeployerAddr) {
            const client = createPublicClient({
                chain: hardhat,
                transport: http('http://127.0.0.1:8545'),
            });
            contractAddress = await client.readContract({
                address: localDeployerAddr,
                abi: localDeployerAbi,
                functionName: 'cryptoPets',
            });
        } else if (liveAddr) {
            contractAddress = liveAddr as `0x${string}`;
        }

        if (!contractAddress) {
            console.error(
                '❌ CryptoPets address not found in deployed_addresses.json (expected CryptoPetsLive#cryptoPets or CryptoPetsModule#LocalCryptoPetsDeployer)'
            );
            return;
        }

        console.log(`📝 Contract address: ${contractAddress}`);

        const frontendEnvLocalPath = join(
            process.cwd(),
            '..',
            '..',
            'frontend',
            '.env.local'
        );

        let envContent = '';
        if (existsSync(frontendEnvLocalPath)) {
            envContent = readFileSync(frontendEnvLocalPath, 'utf8');
        }

        const contractAddressLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;
        const lines = envContent
            .split('\n')
            .filter((line) => !line.startsWith('VITE_VRF_COORDINATOR='));
        const contractAddressIndex = lines.findIndex((line) =>
            line.startsWith('VITE_CONTRACT_ADDRESS=')
        );

        if (contractAddressIndex >= 0) {
            lines[contractAddressIndex] = contractAddressLine;
        } else {
            lines.push(contractAddressLine);
        }

        if (!lines.some((line) => line.startsWith('VITE_API_URL='))) {
            lines.push('VITE_API_URL=http://localhost:3001');
        }

        const updatedContent = lines.filter((line) => line.trim()).join('\n');
        writeFileSync(frontendEnvLocalPath, updatedContent);

        console.log('✅ Contract address injected into frontend .env.local');
        console.log(`🔗 Frontend will use contract: ${contractAddress}`);

        const mobileEnvPath = join(process.cwd(), '..', '..', 'mobile', '.env');
        let mobileEnvContent = '';
        if (existsSync(mobileEnvPath)) {
            mobileEnvContent = readFileSync(mobileEnvPath, 'utf8');
        }
        const mobileContractLine = `CONTRACT_ADDRESS=${contractAddress}`;
        const mobileLines = mobileEnvContent.split('\n');
        const mobileContractIdx = mobileLines.findIndex((line) =>
            line.startsWith('CONTRACT_ADDRESS=')
        );
        if (mobileContractIdx >= 0) {
            mobileLines[mobileContractIdx] = mobileContractLine;
        } else {
            mobileLines.push(mobileContractLine);
        }
        const mobileUpdated = mobileLines.filter((line) => line.trim()).join('\n');
        writeFileSync(mobileEnvPath, mobileUpdated);

        console.log('✅ Contract address injected into mobile .env');
        console.log(`🔗 Mobile will use contract: ${contractAddress}`);
    } catch (error) {
        console.error(
            '❌ Failed to inject contract address:',
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
}
