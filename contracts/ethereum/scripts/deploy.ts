#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';

const NETWORK =
    process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] ??
    process.env.DEPLOY_NETWORK ??
    'localhost';
const IS_SEPOLIA = NETWORK === 'sepolia';
const CHAIN_DIR = IS_SEPOLIA ? 'chain-11155111' : 'chain-31337';
const DEPLOY_CMD = IS_SEPOLIA ? 'pnpm deploy:sepolia' : 'pnpm deploy:local';

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

if (!IS_SEPOLIA) {
    console.log('⏳ Waiting for Hardhat node to be ready...');
    await setTimeout(10000);
}

console.log(`🚀 Deploying contracts to ${NETWORK} network...`);
try {
    execSync(DEPLOY_CMD, { stdio: 'inherit' });
    console.log('✅ Contracts deployed successfully!');

    // Extract contract address and inject into frontend
    await injectContractAddress();
} catch (error) {
    console.error('❌ Contract deployment failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
}

async function injectContractAddress(): Promise<void> {
    try {
        // Read deployed addresses
        const deployedAddressesPath = join(process.cwd(), 'ignition', 'deployments', CHAIN_DIR, 'deployed_addresses.json');

        if (!existsSync(deployedAddressesPath)) {
            console.error('❌ Deployed addresses file not found');
            return;
        }

        const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8'));

        let contractAddress: string | undefined;

        const localDeployerAddr = (
            deployedAddresses['CryptoPetsModule#localDeployer'] ??
            deployedAddresses['CryptoPetsModule#LocalCryptoPetsDeployer']
        ) as `0x${string}` | undefined;
        const sepoliaPetsAddr = deployedAddresses['CryptoPetsSepolia#cryptoPets'] as string | undefined;

        if (IS_SEPOLIA) {
            if (!sepoliaPetsAddr) {
                console.error('❌ CryptoPetsSepolia#cryptoPets not found in deployed_addresses.json');
                return;
            }
            contractAddress = sepoliaPetsAddr;
        } else if (localDeployerAddr) {
            const client = createPublicClient({
                chain: hardhat,
                transport: http('http://127.0.0.1:8545'),
            });
            contractAddress = await client.readContract({
                address: localDeployerAddr,
                abi: localDeployerAbi,
                functionName: 'cryptoPets',
            });
        } else if (sepoliaPetsAddr) {
            contractAddress = sepoliaPetsAddr;
        }

        if (!contractAddress) {
            console.error(
                '❌ CryptoPets address not found (expected CryptoPetsModule#LocalCryptoPetsDeployer or CryptoPetsSepolia#cryptoPets)'
            );
            return;
        }

        console.log(`📝 Contract address: ${contractAddress}`);

        // Update frontend .env file
        const frontendEnvLocalPath = join(process.cwd(), '..', '..', 'frontend', '.env.local');

        // Read existing .env.local or create new content
        let envContent = '';
        if (existsSync(frontendEnvLocalPath)) {
            envContent = readFileSync(frontendEnvLocalPath, 'utf8');
        }

        // Update or add VITE_CONTRACT_ADDRESS
        const contractAddressLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;
        const lines = envContent
            .split('\n')
            .filter((line) => !line.startsWith('VITE_VRF_COORDINATOR='));
        const contractAddressIndex = lines.findIndex(line => line.startsWith('VITE_CONTRACT_ADDRESS='));

        if (contractAddressIndex >= 0) {
            lines[contractAddressIndex] = contractAddressLine;
        } else {
            lines.push(contractAddressLine);
        }

        // Add other common env vars if they don't exist
        if (!lines.some(line => line.startsWith('VITE_API_URL='))) {
            lines.push('VITE_API_URL=http://localhost:3001');
        }

        const updatedContent = lines.filter(line => line.trim()).join('\n');
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
        console.error('❌ Failed to inject contract address:', error instanceof Error ? error.message : 'Unknown error');
    }
}
