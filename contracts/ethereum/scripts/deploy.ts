#!/usr/bin/env tsx

import 'dotenv/config';

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getNetwork, resolveRpcUrl, resolveVrfParams } from './networks.js';

const NETWORK_NAME =
    process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] ??
    process.env.DEPLOY_NETWORK;

if (!NETWORK_NAME || NETWORK_NAME === 'localhost' || NETWORK_NAME === 'hardhat') {
    console.error('❌ Local deploy is not supported via this script for the v2 stack. Run `pnpm test` to exercise contracts locally.');
    process.exit(1);
}

const ignitionEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Bypass Hardhat Ignition's interactive "Confirm deploy to network X?" prompt.
    // Without this, prompts auto-cancel in a non-TTY parent and the deploy silently exits.
    HARDHAT_IGNITION_CONFIRM_DEPLOYMENT: '1',
    HARDHAT_IGNITION_CONFIRM_RESET: '1',
};

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
            CryptoPetsV2Live: {
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

const chainDir = `chain-${network.chainId}`;
const deployCmd = `pnpm hh ignition deploy ignition/modules/CryptoPetsV2Live.ts --network ${network.name} --parameters ${paramsPath}`;

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

        // v2 live: PetCoreV1 proxy is the ERC-721 token contract the frontend addresses.
        const liveAddr = deployedAddresses['CryptoPetsV2Live#PetCoreV1Proxy'] as string | undefined;
        if (liveAddr) {
            contractAddress = liveAddr as `0x${string}`;
        }

        if (!contractAddress) {
            console.error(
                '❌ PetCoreV1 proxy address not found in deployed_addresses.json (expected CryptoPetsV2Live#PetCoreV1Proxy)'
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
